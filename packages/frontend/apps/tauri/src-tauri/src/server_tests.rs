use super::*;
use axum::{
  Json,
  body::Bytes,
  routing::{get, post},
};

struct TestServer {
  url: String,
  task: tokio::task::JoinHandle<()>,
}
impl Drop for TestServer {
  fn drop(&mut self) {
    self.task.abort();
  }
}

async fn serve(app: Router) -> TestServer {
  let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
  let url = format!("http://{}", listener.local_addr().unwrap());
  let task = tokio::spawn(async move {
    axum::serve(listener, app).await.unwrap();
  });
  TestServer { url, task }
}

async fn proxy(upstream: &str) -> TestServer {
  let assets = Arc::new(|key: &str| (key == "index.html").then(|| b"offline editor".to_vec()));
  serve(router(
    ServerState::new(validate_upstream(upstream).unwrap(), assets).unwrap(),
  ))
  .await
}

fn http_request(client: &reqwest::Client, method: Method, url: &str) -> reqwest::RequestBuilder {
  client
    .request(method, url)
    .header(header::HOST, ADDRESS)
    .header(header::ORIGIN, ORIGIN)
}

#[test]
fn restricts_upstream_and_asset_paths() {
  assert!(validate_upstream("https://affine.papertrails.cc").is_ok());
  assert!(validate_upstream("http://127.0.0.1:3010").is_ok());
  for value in [
    "http://remote.example",
    "https://user:password@example.com",
    "https://example.com/path",
    ORIGIN,
    "file:///tmp/app",
  ] {
    assert!(validate_upstream(value).is_err(), "unexpected accepted URL: {value}");
  }
  assert_eq!(
    asset_key("/assets/my%20font.woff2?v=1"),
    Some("assets/my font.woff2".into())
  );
  for path in ["/../secret", "/%2e%2e/secret", "/assets%5csecret", "/%00"] {
    assert!(asset_key(path).is_none());
  }
}

#[tokio::test]
async fn forwards_auth_csrf_and_streamed_body_and_preserves_cookies() {
  let upstream = serve(Router::new().route(
    "/api/test",
    post(|headers: HeaderMap, body: Bytes| async move {
      let value = |name: &str| headers.get(name).unwrap().to_str().unwrap().to_owned();
      let mut response = Json(serde_json::json!({
        "cookie": value("cookie"), "csrf": value("x-affine-csrf-token"),
        "origin": value("origin"), "size": body.len(), "first": body[0],
        "last": body[body.len()-1], "forwardedHost": headers.contains_key("x-forwarded-host"),
      }))
      .into_response();
      response.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_static("affine_session=test; Path=/; HttpOnly; SameSite=Lax"),
      );
      response.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_static("affine_csrf_token=csrf; Path=/; SameSite=Lax"),
      );
      response
    }),
  ))
  .await;
  let proxy = proxy(&upstream.url).await;
  let client = reqwest::Client::new();
  let bytes = vec![42u8; 512 * 1024];
  let response = http_request(&client, Method::POST, &format!("{}/api/test", proxy.url))
    .header(header::COOKIE, "affine_session=test")
    .header("x-affine-csrf-token", "csrf")
    .header("x-forwarded-host", "evil.example")
    .body(reqwest::Body::wrap_stream(futures_util::stream::iter(
      bytes
        .chunks(8192)
        .map(|chunk| Ok::<_, std::io::Error>(chunk.to_vec()))
        .collect::<Vec<_>>(),
    )))
    .send()
    .await
    .unwrap();
  assert_eq!(response.status(), StatusCode::OK);
  let cookies: Vec<_> = response
    .headers()
    .get_all(header::SET_COOKIE)
    .iter()
    .map(|v| v.to_str().unwrap().to_owned())
    .collect();
  assert_eq!(cookies.len(), 2);
  assert!(cookies[0].contains("HttpOnly"));
  let data: serde_json::Value = serde_json::from_slice(&response.bytes().await.unwrap()).unwrap();
  assert_eq!(data["cookie"], "affine_session=test");
  assert_eq!(data["csrf"], "csrf");
  assert_eq!(data["origin"], ORIGIN);
  assert_eq!(data["size"], 512 * 1024);
  assert_eq!(data["first"], 42);
  assert_eq!(data["last"], 42);
  assert_eq!(data["forwardedHost"], false);
}

#[tokio::test]
async fn rejects_cross_origin_access_and_keeps_offline_assets_available() {
  let upstream = serve(Router::new()).await;
  let target = upstream.url.clone();
  drop(upstream);
  let proxy = proxy(&target).await;
  let client = reqwest::Client::new();
  let response = http_request(&client, Method::GET, &proxy.url).send().await.unwrap();
  assert_eq!(response.text().await.unwrap(), "offline editor");
  let response = http_request(&client, Method::GET, &format!("{}/api/auth/session", proxy.url))
    .send()
    .await
    .unwrap();
  assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
  for (name, value) in [
    ("host", "evil.example"),
    ("origin", "https://evil.example"),
    ("sec-fetch-site", "cross-site"),
    ("referer", "https://evil.example/page"),
  ] {
    let response = http_request(&client, Method::GET, &proxy.url)
      .header(name, value)
      .send()
      .await
      .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN, "did not reject {name}");
  }
  let response = client
    .post(format!("{}/api/auth/sign-in", proxy.url))
    .header(header::HOST, ADDRESS)
    .send()
    .await
    .unwrap();
  assert_eq!(response.status(), StatusCode::FORBIDDEN);
  let response = http_request(&client, Method::GET, &format!("{}/missing.js", proxy.url))
    .send()
    .await
    .unwrap();
  assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[test]
fn maps_upstream_cookies_and_redirects_only_to_the_app_origin() {
  let mut headers = HeaderMap::new();
  headers.append(
    header::SET_COOKIE,
    HeaderValue::from_static(
      "affine_session=opaque; Domain=affine.papertrails.cc; Secure; HttpOnly; Path=/; SameSite=Lax",
    ),
  );
  headers.insert(
    header::LOCATION,
    HeaderValue::from_static("https://affine.papertrails.cc/workspace/id?x=1"),
  );
  let result = response_headers(&headers, &validate_upstream("https://affine.papertrails.cc").unwrap());
  assert_eq!(
    result.get(header::SET_COOKIE).unwrap(),
    "affine_session=opaque; HttpOnly; Path=/; SameSite=Lax"
  );
  assert_eq!(
    result.get(header::LOCATION).unwrap(),
    "http://127.0.0.1:47861/workspace/id?x=1"
  );
  headers.insert(
    header::LOCATION,
    HeaderValue::from_static("https://accounts.google.com/login"),
  );
  let result = response_headers(&headers, &validate_upstream("https://affine.papertrails.cc").unwrap());
  assert_eq!(
    result.get(header::LOCATION).unwrap(),
    "https://accounts.google.com/login"
  );
}

#[test]
fn https_origin_mapping_requires_a_trusted_local_request() {
  let remote = validate_upstream("https://affine.papertrails.cc").unwrap();
  let mut headers = HeaderMap::new();
  headers.insert(header::HOST, HeaderValue::from_static(ADDRESS));
  headers.insert(header::ORIGIN, HeaderValue::from_static(ORIGIN));
  headers.insert(
    header::REFERER,
    HeaderValue::from_static("http://127.0.0.1:47861/workspace/note"),
  );
  headers.insert(header::COOKIE, HeaderValue::from_static("affine_session=test"));
  headers.insert("x-affine-csrf-token", HeaderValue::from_static("csrf"));
  assert!(trusted_request(&headers, &Method::POST));
  let forwarded = request_headers(&headers, &remote);
  assert_eq!(forwarded.get(header::ORIGIN).unwrap(), "https://affine.papertrails.cc");
  assert_eq!(
    forwarded.get(header::REFERER).unwrap(),
    "https://affine.papertrails.cc/workspace/note"
  );
  assert_eq!(forwarded.get(header::COOKIE).unwrap(), "affine_session=test");
  assert_eq!(forwarded.get("x-affine-csrf-token").unwrap(), "csrf");
  headers.insert(header::ORIGIN, HeaderValue::from_static("https://evil.example"));
  assert!(!trusted_request(&headers, &Method::POST));
  // Even the mapping helper cannot turn an untrusted Origin into a trusted one.
  assert_eq!(
    request_headers(&headers, &remote).get(header::ORIGIN).unwrap(),
    "https://evil.example"
  );
}

async fn websocket_server(upgrade: WebSocketUpgrade, headers: HeaderMap) -> Response<Body> {
  if headers.get(header::COOKIE).is_none_or(|v| v != "affine_session=test") {
    return text(StatusCode::UNAUTHORIZED, "Authentication required");
  }
  assert_eq!(headers.get(header::ORIGIN).unwrap(), ORIGIN);
  upgrade
    .on_upgrade(|mut socket| async move {
      while let Some(Ok(message)) = socket.next().await {
        if matches!(message, Message::Close(_)) {
          break;
        }
        if socket.send(message).await.is_err() {
          break;
        }
      }
    })
    .into_response()
}

fn websocket_request(url: &str) -> tungstenite::http::Request<()> {
  let mut request = format!("{}/socket.io/?EIO=4&transport=websocket", url.replace("http:", "ws:"))
    .into_client_request()
    .unwrap();
  request
    .headers_mut()
    .insert(header::HOST, HeaderValue::from_static(ADDRESS));
  request
    .headers_mut()
    .insert(header::ORIGIN, HeaderValue::from_static(ORIGIN));
  request
}

#[tokio::test]
async fn websocket_forwards_auth_and_frames_and_preserves_handshake_errors() {
  let upstream = serve(Router::new().route("/socket.io/", get(websocket_server))).await;
  let proxy = proxy(&upstream.url).await;
  let error = tokio_tungstenite::connect_async(websocket_request(&proxy.url))
    .await
    .unwrap_err();
  assert!(matches!(error, tungstenite::Error::Http(response) if response.status() == StatusCode::UNAUTHORIZED));
  let mut request = websocket_request(&proxy.url);
  request
    .headers_mut()
    .insert(header::COOKIE, HeaderValue::from_static("affine_session=test"));
  let (mut socket, response) = tokio_tungstenite::connect_async(request).await.unwrap();
  assert_eq!(response.status(), StatusCode::SWITCHING_PROTOCOLS);
  for message in [
    tungstenite::Message::Text("sync update".into()),
    tungstenite::Message::Binary(vec![0, 1, 255].into()),
  ] {
    socket.send(message.clone()).await.unwrap();
    let echoed = tokio::time::timeout(Duration::from_secs(2), socket.next())
      .await
      .unwrap()
      .unwrap()
      .unwrap();
    assert_eq!(echoed, message);
  }
  // An open sync connection must not occupy an asset-serving worker.
  let asset = http_request(&reqwest::Client::new(), Method::GET, &proxy.url)
    .send()
    .await
    .unwrap();
  assert_eq!(asset.status(), StatusCode::OK);
  socket.close(None).await.unwrap();
  let mut request = websocket_request(&proxy.url);
  request
    .headers_mut()
    .insert(header::ORIGIN, HeaderValue::from_static("https://evil.example"));
  let error = tokio_tungstenite::connect_async(request).await.unwrap_err();
  assert!(matches!(error, tungstenite::Error::Http(response) if response.status() == StatusCode::FORBIDDEN));
}
