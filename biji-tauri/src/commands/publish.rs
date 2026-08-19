use crate::AppState;
use biji_core::services::{PublishConfig, PublishResult};
use tauri::State;

#[tauri::command]
pub fn publish_site(
    state: State<AppState>,
    config: PublishConfig,
) -> Result<PublishResult, String> {
    let core = state.core.lock().map_err(|e| e.to_string())?;
    core.publish
        .publish(&config, &core.capabilities)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_generator(
    state: State<AppState>,
    generator: String,
) -> Result<(bool, Option<String>), String> {
    let gen = match generator.to_lowercase().as_str() {
        "hugo" => biji_core::services::StaticSiteGenerator::Hugo,
        "astro" => biji_core::services::StaticSiteGenerator::Astro,
        "vitepress" => biji_core::services::StaticSiteGenerator::VitePress,
        _ => return Err(format!("Unknown generator: {}", generator)),
    };
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .publish
        .check_generator(&gen)
        .map_err(|e| e.to_string())
}
