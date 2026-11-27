fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["can_self_update", "restart_app"]),
        ),
    )
    .expect("échec du build Tauri");
}
