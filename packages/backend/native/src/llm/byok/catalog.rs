use std::collections::BTreeMap;

use llm_adapter::capability::{DeclaredModelCapability, provider_default_capability_upper_bound};
use serde::Serialize;
use sha2::{Digest, Sha256};

use super::{ByokCapabilityInput, contract::capability_input};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[napi_derive::napi(object)]
pub struct ByokCatalogModelOutput {
  pub model_id: String,
  pub display_name: String,
  pub recommended: bool,
  pub capabilities: Vec<ByokCapabilityInput>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[napi_derive::napi(object)]
pub struct ByokCatalogProviderOutput {
  pub provider: String,
  pub models: Vec<ByokCatalogModelOutput>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[napi_derive::napi(object)]
pub struct ByokCatalogOutput {
  pub version: String,
  pub providers: Vec<ByokCatalogProviderOutput>,
}

pub fn byok_catalog() -> ByokCatalogOutput {
  let variants = llm_adapter::core::default_model_registry_variants();
  let mut providers = ["openai", "anthropic", "gemini", "fal"]
    .into_iter()
    .map(|provider| (provider, BTreeMap::new()))
    .collect::<BTreeMap<_, BTreeMap<String, ByokCatalogModelOutput>>>();

  for variant in variants {
    let Some(provider) = provider_for_backend(&variant.backend_kind) else {
      continue;
    };
    let Some(capabilities) = provider_default_capability_upper_bound(provider, &variant.raw_model_id) else {
      continue;
    };
    providers
      .entry(provider)
      .or_default()
      .entry(variant.raw_model_id.clone())
      .or_insert_with(|| ByokCatalogModelOutput {
        model_id: variant.raw_model_id.clone(),
        display_name: variant.display_name.unwrap_or_else(|| variant.raw_model_id.clone()),
        recommended: variant
          .capabilities
          .iter()
          .any(|capability| capability.default_for_output_type == Some(true)),
        capabilities: capabilities.into_iter().map(capability_input).collect(),
      });
  }

  let providers = providers
    .into_iter()
    .map(|(provider, models)| ByokCatalogProviderOutput {
      provider: provider.to_string(),
      models: models.into_values().collect(),
    })
    .collect::<Vec<_>>();
  let encoded = serde_json::to_vec(&providers).expect("BYOK catalog must serialize");
  let version = Sha256::digest(encoded)
    .iter()
    .take(8)
    .map(|byte| format!("{byte:02x}"))
    .collect();
  ByokCatalogOutput { version, providers }
}

/// Providers release models faster than the bundled registry is updated, so a
/// model the registry does not list is bounded by the provider's recommended
/// text models (the catalog entries clients copy capabilities from) instead of
/// being rejected.
pub(crate) fn unlisted_model_upper_bounds(provider: &str) -> Vec<Vec<DeclaredModelCapability>> {
  llm_adapter::core::default_model_registry_variants()
    .into_iter()
    .filter(|variant| provider_for_backend(&variant.backend_kind) == Some(provider))
    .filter(|variant| {
      let capabilities = &variant.capabilities;
      capabilities
        .iter()
        .any(|capability| capability.default_for_output_type == Some(true))
        && capabilities
          .iter()
          .any(|capability| capability.output.iter().any(|output| output == "text"))
    })
    .filter_map(|variant| provider_default_capability_upper_bound(provider, &variant.raw_model_id))
    .collect()
}

fn provider_for_backend(backend: &str) -> Option<&'static str> {
  match backend {
    "openai_responses" => Some("openai"),
    "anthropic" => Some("anthropic"),
    "gemini_api" => Some("gemini"),
    "fal" => Some("fal"),
    _ => None,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn catalog_contains_explicit_provider_default_declarations() {
    let catalog = byok_catalog();
    assert!(!catalog.version.is_empty());
    for provider in &catalog.providers {
      assert!(
        !provider.models.is_empty(),
        "{} has no catalog models",
        provider.provider
      );
      for model in &provider.models {
        assert!(!model.model_id.is_empty());
        assert!(!model.capabilities.is_empty());
      }
    }
  }

  #[test]
  fn unlisted_models_are_bounded_by_recommended_text_models() {
    for provider in ["openai", "anthropic", "gemini"] {
      assert!(
        !unlisted_model_upper_bounds(provider).is_empty(),
        "{provider} has no recommended text model"
      );
    }
    assert!(unlisted_model_upper_bounds("fal").is_empty());
    assert!(unlisted_model_upper_bounds("unknown").is_empty());
  }

  #[test]
  fn recommended_text_catalog_capabilities_are_valid_for_unlisted_models() {
    // clients give a provider-listed model the capabilities of a recommended
    // text catalog model; the contract must accept exactly that declaration
    for provider in byok_catalog().providers {
      for template in provider.models.iter().filter(|model| {
        model.recommended
          && model
            .capabilities
            .iter()
            .any(|capability| capability.output.iter().any(|output| output == "text"))
      }) {
        let definition = crate::llm::byok::ByokProfileDefinitionInput {
          endpoint: crate::llm::byok::ByokEndpointInput {
            kind: "provider_default".to_string(),
            url: None,
            dialect: None,
          },
          models: vec![crate::llm::byok::ByokModelDeclarationInput {
            model_id: "released-after-this-build".to_string(),
            enabled: true,
            capabilities: template.capabilities.clone(),
          }],
        };
        assert!(
          crate::llm::byok::validate_definition(&provider.provider, definition).is_ok(),
          "{} template {} rejected",
          provider.provider,
          template.model_id
        );
      }
    }
  }
}
