use std::{path::Path, sync::Arc, time::Duration};

use axum::{
  Router,
  body::Body,
  extract::{
    FromRequestParts, State, WebSocketUpgrade,
    ws::{Message, WebSocket},
  },
  http::{HeaderMap, HeaderName, HeaderValue, Method, Request, Response, StatusCode, Uri, header},
  response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tauri::Url;
use tokio_tungstenite::tungstenite::{self, client::IntoClientRequest};

pub const ADDRESS: &str = "127.0.0.1:47861";
pub const ORIGIN: &str = "http://127.0.0.1:47861";
const DEFAULT_UPSTREAM: &str = "http://127.0.0.1:3010";
type AssetLoader = Arc<dyn Fn(&str) -> Option<Vec<u8>> + Send + Sync>;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ServerConfig {
  url: String,
}

pub fn configured_upstream(config_dir: &Path) -> Result<Url, Box<dyn std::error::Error>> {
  let file = config_dir.join("server.json");
  let value = if let Ok(value) = std::env::var("AFFINE_TAURI_SERVER_URL") {
    value
  } else if file.exists() {
    serde_json::from_slice::<ServerConfig>(&std::fs::read(file)?)?.url
  } else {
    DEFAULT_UPSTREAM.into()
  };
  validate_upstream(&value).map_err(Into::into)
}

fn validate_upstream(value: &str) -> Result<Url, &'static str> {
  let url = Url::parse(value).map_err(|_| "Invalid AFFiNE server URL")?;
  let loopback = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
  if !(url.scheme() == "https" || (url.scheme() == "http" && loopback))
    || url.origin().ascii_serialization() == ORIGIN
    || url.host_str().is_none()
    || !url.username().is_empty()
    || url.password().is_some()
    || url.path() != "/"
    || url.query().is_some()
    || url.fragment().is_some()
  {
    return Err("Use a root HTTPS server URL, or HTTP on localhost; credentials and URL paths are not allowed");
  }
  Ok(url)
}

#[derive(Clone)]
struct ServerState {
  upstream: Url,
  client: reqwest::Client,
  assets: AssetLoader,
}

impl ServerState {
  fn new(upstream: Url, assets: AssetLoader) -> Result<Self, reqwest::Error> {
    Ok(Self {
      upstream,
      assets,
      client: reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        // Socket.IO polling can wait 25s; uploads and SSE may last much longer.
        .read_timeout(Duration::from_secs(120))
        .no_proxy()
        .build()?,
    })
  }

  fn target(&self, uri: &Uri) -> Url {
    let mut url = self.upstream.clone();
    url.set_path(uri.path());
    url.set_query(uri.query());
    url
  }
}

pub fn start_server(
  load: impl Fn(&str) -> Option<Vec<u8>> + Send + Sync + 'static,
  upstream: Url,
) -> Result<(), Box<dyn std::error::Error>> {
  let listener = std::net::TcpListener::bind(ADDRESS)?;
  listener.set_nonblocking(true)?;
  let state = ServerState::new(upstream, Arc::new(load))?;
  tauri::async_runtime::spawn(async move {
    let listener = tokio::net::TcpListener::from_std(listener).expect("valid local listener");
    if let Err(error) = axum::serve(listener, router(state)).await {
      eprintln!("AFFiNE Tauri local server stopped: {error}");
    }
  });
  Ok(())
}

fn router(state: ServerState) -> Router {
  Router::new().fallback(handle).with_state(state)
}

fn text(status: StatusCode, message: &str) -> Response<Body> {
  (
    status,
    [
      (header::CONTENT_TYPE, "text/plain; charset=utf-8"),
      (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
    ],
    message.to_owned(),
  )
    .into_response()
}

fn trusted_request(headers: &HeaderMap, method: &Method) -> bool {
  for name in ["host", "origin", "referer", "sec-fetch-site"] {
    if headers.get_all(name).iter().count() > 1 {
      return false;
    }
  }
  if headers.get(header::HOST).and_then(|v| v.to_str().ok()) != Some(ADDRESS) {
    return false;
  }
  if headers.get(header::ORIGIN).is_some_and(|v| v != ORIGIN) {
    return false;
  }
  if headers
    .get("sec-fetch-site")
    .is_some_and(|v| v != "same-origin" && v != "none")
  {
    return false;
  }
  if headers.get(header::REFERER).is_some_and(|v| {
    v.to_str()
      .ok()
      .and_then(|v| Url::parse(v).ok())
      .is_none_or(|v| v.origin().ascii_serialization() != ORIGIN)
  }) {
    return false;
  }
  if !matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS) {
    return headers.get(header::ORIGIN).is_some_and(|v| v == ORIGIN) || headers.get(header::REFERER).is_some();
  }
  true
}

fn api_path(path: &str) -> bool {
  path.starts_with("/api/") || path == "/graphql" || path.starts_with("/socket.io/")
}

fn asset_key(path: &str) -> Option<String> {
  let decoded = percent_encoding::percent_decode_str(path.split('?').next()?)
    .decode_utf8()
    .ok()?;
  if decoded.contains('\\') || decoded.contains('\0') || decoded.split('/').any(|part| part == "..") {
    return None;
  }
  let key = decoded.trim_start_matches('/');
  Some(if key.is_empty() { "index.html" } else { key }.to_owned())
}

async fn handle(State(state): State<ServerState>, request: Request<Body>) -> Response<Body> {
  if !trusted_request(request.headers(), request.method()) {
    return text(StatusCode::FORBIDDEN, "Cross-origin request denied");
  }
  let Some(mut key) = asset_key(request.uri().path()) else {
    return text(StatusCode::BAD_REQUEST, "Invalid path");
  };
  if api_path(request.uri().path()) {
    if request.headers().contains_key(header::UPGRADE) {
      if !request.uri().path().starts_with("/socket.io/") {
        return text(StatusCode::BAD_REQUEST, "Upgrade is only supported for sync");
      }
      return proxy_websocket(state, request).await;
    }
    return proxy_http(state, request).await;
  }
  if request.method() != Method::GET && request.method() != Method::HEAD {
    return text(StatusCode::METHOD_NOT_ALLOWED, "Method not allowed");
  }
  let data = (state.assets)(&key).or_else(|| {
    if !key.rsplit('/').next().unwrap_or_default().contains('.') {
      key = "index.html".into();
      (state.assets)(&key)
    } else {
      None
    }
  });
  let Some(bytes) = data else {
    return text(StatusCode::NOT_FOUND, "Asset not found");
  };
  let length = bytes.len();
  let body = if request.method() == Method::HEAD {
    Body::empty()
  } else {
    Body::from(bytes)
  };
  Response::builder()
    .status(StatusCode::OK)
    .header(
      header::CONTENT_TYPE,
      mime_guess::from_path(&key).first_or_octet_stream().as_ref(),
    )
    .header(header::CONTENT_LENGTH, length)
    .header(header::CACHE_CONTROL, "no-cache")
    .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
    .header("cross-origin-resource-policy", "same-origin")
    .body(body)
    .expect("valid asset response")
}

fn remove_hop_headers(headers: &mut HeaderMap) {
  let nominated: Vec<HeaderName> = headers
    .get_all(header::CONNECTION)
    .iter()
    .filter_map(|v| v.to_str().ok())
    .flat_map(|v| v.split(','))
    .filter_map(|v| HeaderName::from_bytes(v.trim().as_bytes()).ok())
    .collect();
  for name in nominated {
    headers.remove(name);
  }
  for name in [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ] {
    headers.remove(name);
  }
}

fn request_headers(headers: &HeaderMap, upstream: &Url) -> HeaderMap {
  let mut forwarded = headers.clone();
  remove_hop_headers(&mut forwarded);
  // The HTTP client generates Host for the fixed upstream. Never trust proxy
  // routing headers supplied by a web page. Preserve cookies and CSRF; verified
  // Origin/Referer are mapped below only for an HTTPS upstream.
  for name in [
    "host",
    "forwarded",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-forwarded-for",
  ] {
    forwarded.remove(name);
  }
  // The local HTTP server explicitly permits our real origin. For a future
  // HTTPS deployment, terminate the verified local origin at this proxy so the
  // official server can retain its normal same-origin policy. This function is
  // called only after trusted_request rejects foreign/duplicate origin headers.
  if upstream.scheme() == "https" {
    if forwarded.get(header::ORIGIN).is_some_and(|value| value == ORIGIN) {
      forwarded.insert(
        header::ORIGIN,
        HeaderValue::from_str(&upstream.origin().ascii_serialization()).expect("valid origin"),
      );
    }
    if let Some(referer) = forwarded
      .get(header::REFERER)
      .and_then(|v| v.to_str().ok())
      .and_then(|v| Url::parse(v).ok())
    {
      if referer.origin().ascii_serialization() == ORIGIN {
        let value = format!(
          "{}{}",
          upstream.origin().ascii_serialization(),
          &referer[url::Position::BeforePath..]
        );
        forwarded.insert(header::REFERER, HeaderValue::from_str(&value).expect("valid referer"));
      }
    }
  }
  forwarded
}

fn local_cookie(value: &HeaderValue) -> Option<HeaderValue> {
  // Cookies belong to this app's fixed loopback origin, not the upstream domain.
  // Keep HttpOnly, Path, expiry and SameSite. For an HTTPS upstream, Secure is
  // terminated at the Rust TLS connection; the WebView transport is loopback.
  let parts: Vec<&str> = value.to_str().ok()?.split(';').collect();
  let first = *parts.first()?;
  if first.starts_with("__Host-") || first.starts_with("__Secure-") {
    return None;
  }
  let mut output = vec![first.to_owned()];
  for part in parts.into_iter().skip(1) {
    let trimmed = part.trim();
    let name = trimmed.split('=').next().unwrap_or_default();
    if name.eq_ignore_ascii_case("domain") || name.eq_ignore_ascii_case("secure") {
      continue;
    }
    if trimmed.eq_ignore_ascii_case("samesite=none") {
      output.push("SameSite=Lax".into());
    } else {
      output.push(trimmed.into());
    }
  }
  HeaderValue::from_str(&output.join("; ")).ok()
}

fn response_headers(headers: &HeaderMap, upstream: &Url) -> HeaderMap {
  let mut result = headers.clone();
  remove_hop_headers(&mut result);
  result.remove(header::SET_COOKIE);
  for value in headers.get_all(header::SET_COOKIE) {
    if let Some(value) = local_cookie(value) {
      result.append(header::SET_COOKIE, value);
    }
  }
  if let Some(value) = headers.get(header::LOCATION).and_then(|v| v.to_str().ok()) {
    if let Ok(url) = Url::parse(value) {
      if url.origin() == upstream.origin() {
        if let Ok(local) = HeaderValue::from_str(&format!("{ORIGIN}{}", &url[url::Position::BeforePath..])) {
          result.insert(header::LOCATION, local);
        }
      }
    }
  }
  result
}

async fn proxy_http(state: ServerState, request: Request<Body>) -> Response<Body> {
  let target = state.target(request.uri());
  let (parts, body) = request.into_parts();
  let response = state
    .client
    .request(parts.method, target)
    .headers(request_headers(&parts.headers, &state.upstream))
    .body(reqwest::Body::wrap_stream(body.into_data_stream()))
    .send()
    .await;
  match response {
    Ok(response) => {
      let status = response.status();
      let headers = response_headers(response.headers(), &state.upstream);
      let mut output = Response::new(Body::from_stream(response.bytes_stream()));
      *output.status_mut() = status;
      *output.headers_mut() = headers;
      output
    }
    Err(_) => text(
      StatusCode::BAD_GATEWAY,
      "AFFiNE server is unavailable. Local notes remain available.",
    ),
  }
}

async fn proxy_websocket(state: ServerState, request: Request<Body>) -> Response<Body> {
  let mut target = state.target(request.uri());
  let scheme = if target.scheme() == "https" { "wss" } else { "ws" };
  target.set_scheme(scheme).expect("valid socket scheme");
  let (mut parts, _) = request.into_parts();
  let upgrade = match WebSocketUpgrade::from_request_parts(&mut parts, &state).await {
    Ok(upgrade) => upgrade,
    Err(error) => return error.into_response(),
  };
  let mut upstream_request = target.as_str().into_client_request().expect("valid socket URL");
  for (name, value) in request_headers(&parts.headers, &state.upstream) {
    let Some(name) = name else {
      continue;
    };
    if !name.as_str().starts_with("sec-websocket-") || name == header::SEC_WEBSOCKET_PROTOCOL {
      upstream_request.headers_mut().insert(name, value);
    }
  }
  let upstream = tokio::time::timeout(
    Duration::from_secs(10),
    tokio_tungstenite::connect_async(upstream_request),
  )
  .await;
  let (socket, response) = match upstream {
    Ok(Ok(value)) => value,
    Ok(Err(tungstenite::Error::Http(response))) => {
      return text(response.status(), "AFFiNE rejected the sync connection");
    }
    _ => return text(StatusCode::BAD_GATEWAY, "AFFiNE sync server is unavailable"),
  };
  let upgrade = if let Some(protocol) = response
    .headers()
    .get(header::SEC_WEBSOCKET_PROTOCOL)
    .and_then(|v| v.to_str().ok())
  {
    upgrade.protocols([protocol.to_owned()])
  } else {
    upgrade
  };
  upgrade
    .on_upgrade(move |client| relay_socket(client, socket))
    .into_response()
}

async fn relay_socket(
  client: WebSocket,
  upstream: tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
) {
  let (mut client_tx, mut client_rx) = client.split();
  let (mut upstream_tx, mut upstream_rx) = upstream.split();
  let to_upstream = async {
    while let Some(Ok(message)) = client_rx.next().await {
      let message = match message {
        Message::Text(value) => tungstenite::Message::Text(value.to_string().into()),
        Message::Binary(value) => tungstenite::Message::Binary(value),
        Message::Ping(value) => tungstenite::Message::Ping(value),
        Message::Pong(value) => tungstenite::Message::Pong(value),
        Message::Close(_) => {
          let _ = upstream_tx.close().await;
          break;
        }
      };
      if upstream_tx.send(message).await.is_err() {
        break;
      }
    }
  };
  let to_client = async {
    while let Some(Ok(message)) = upstream_rx.next().await {
      let message = match message {
        tungstenite::Message::Text(value) => Message::Text(value.to_string().into()),
        tungstenite::Message::Binary(value) => Message::Binary(value),
        tungstenite::Message::Ping(value) => Message::Ping(value),
        tungstenite::Message::Pong(value) => Message::Pong(value),
        tungstenite::Message::Close(_) => {
          let _ = client_tx.close().await;
          break;
        }
        tungstenite::Message::Frame(_) => continue,
      };
      if client_tx.send(message).await.is_err() {
        break;
      }
    }
  };
  tokio::select! { _ = to_upstream => {}, _ = to_client => {} }
}

#[cfg(test)]
#[path = "server_tests.rs"]
mod tests;
