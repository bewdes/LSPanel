use crate::{
    administration_commands, app_shutdown, auto_heal_monitor, auto_stop_monitor, backup_scheduler,
    certificate_commands, database_commands, desktop_commands, disk_space_monitor,
    environment_commands, file_manager_commands, git_commands, git_status_monitor,
    livelink_commands, logs, mailpit_commands, native_runtime, operations, project_export_commands,
    runtime_commands, settings_commands, site_commands, snapshot_commands, storage, terminal,
    terminal_commands, tls_expiry_monitor, tunnel_provider,
};

pub fn run() {
    if std::path::Path::new("/usr/bin/podman-compose").exists() {
        std::env::set_var("PODMAN_COMPOSE_PROVIDER", "/usr/bin/podman-compose");
    }
    tauri::Builder::default()
        .manage(logs::LogStreams::default())
        .manage(terminal::TerminalSessions::default())
        .manage(native_runtime::NativeProcesses::default())
        .manage(tunnel_provider::TunnelProcesses::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            storage::initialize(app.handle()).map_err(std::io::Error::other)?;
            operations::recover_interrupted(app.handle()).map_err(std::io::Error::other)?;
            backup_scheduler::start(app.handle());
            disk_space_monitor::start(app.handle());
            auto_stop_monitor::start(app.handle());
            auto_heal_monitor::start(app.handle());
            git_status_monitor::start(app.handle());
            tls_expiry_monitor::start(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_commands::open_path,
            desktop_commands::open_url,
            livelink_commands::livelink_status,
            livelink_commands::start_livelink,
            livelink_commands::stop_livelink,
            livelink_commands::set_ngrok_authtoken,
            livelink_commands::cloudflare_tunnel_login,
            livelink_commands::cloudflare_tunnel_reset,
            certificate_commands::install_local_ca,
            certificate_commands::reissue_local_https,
            certificate_commands::local_certificate_status,
            certificate_commands::delete_local_https,
            certificate_commands::reset_local_ca,
            desktop_commands::open_terminal,
            desktop_commands::open_editor,
            administration_commands::export_environment_logs,
            desktop_commands::open_containers_window,
            administration_commands::container_runtime_status,
            administration_commands::container_runtimes_status,
            administration_commands::dependency_install_plan,
            administration_commands::install_dependency,
            administration_commands::list_environments,
            administration_commands::save_environment,
            administration_commands::delete_environment,
            administration_commands::operate_environment,
            runtime_commands::operate_environment_service,
            runtime_commands::environment_service_configuration,
            runtime_commands::execute_environment_service_command,
            runtime_commands::clear_environment_service_logs,
            runtime_commands::environment_service_url,
            runtime_commands::environment_topology,
            runtime_commands::inspect_environment,
            runtime_commands::environment_logs,
            runtime_commands::environment_status,
            runtime_commands::environment_resources,
            runtime_commands::diagnose_environment,
            administration_commands::list_operations,
            administration_commands::delete_operation,
            administration_commands::clear_operations,
            administration_commands::list_notifications,
            administration_commands::delete_notification,
            administration_commands::mark_notifications_read,
            administration_commands::clear_notifications,
            administration_commands::system_health,
            administration_commands::disk_usage,
            administration_commands::workspace_free_space,
            administration_commands::prune_build_cache,
            administration_commands::prune_dangling_images,
            administration_commands::project_health,
            administration_commands::allocate_native_port,
            administration_commands::start_environment_log_stream,
            administration_commands::stop_environment_log_stream,
            environment_commands::read_site_environment,
            environment_commands::read_site_environment_example,
            environment_commands::write_site_environment,
            environment_commands::generate_environment_secret,
            environment_commands::import_site_environment,
            environment_commands::export_site_environment,
            environment_commands::list_site_environment_profiles,
            environment_commands::save_site_environment_profile,
            environment_commands::activate_site_environment_profile,
            environment_commands::delete_site_environment_profile,
            file_manager_commands::list_project_files,
            file_manager_commands::read_project_file,
            file_manager_commands::write_project_file,
            file_manager_commands::create_project_directory,
            file_manager_commands::rename_project_file,
            file_manager_commands::delete_project_file,
            file_manager_commands::search_project_files,
            file_manager_commands::project_file_absolute_path,
            file_manager_commands::project_file_usage,
            file_manager_commands::file_manager_overview,
            file_manager_commands::file_manager_folder_details,
            file_manager_commands::set_project_file_permissions,
            file_manager_commands::list_managed_files,
            file_manager_commands::read_managed_file,
            database_commands::list_database_backups,
            database_commands::create_database_backup,
            database_commands::prune_database_backups,
            database_commands::restore_database_backup,
            database_commands::delete_database_backup,
            database_commands::database_info,
            database_commands::database_query,
            database_commands::list_databases,
            database_commands::create_database,
            database_commands::delete_database,
            database_commands::import_database_file,
            database_commands::list_dump_file_tables,
            database_commands::import_database_tables,
            database_commands::export_database_file,
            database_commands::list_database_tables,
            database_commands::export_database_tables,
            database_commands::clear_database,
            database_commands::clone_database,
            database_commands::rename_database,
            snapshot_commands::list_project_snapshots,
            snapshot_commands::compare_project_snapshot,
            snapshot_commands::create_project_snapshot,
            snapshot_commands::restore_project_snapshot,
            snapshot_commands::delete_project_snapshot,
            snapshot_commands::export_project_snapshot,
            snapshot_commands::import_project_snapshot,
            snapshot_commands::prune_project_snapshots,
            terminal_commands::open_container_terminal,
            terminal_commands::write_container_terminal,
            terminal_commands::resize_container_terminal,
            terminal_commands::close_container_terminal,
            terminal_commands::list_saved_commands,
            terminal_commands::save_quick_command,
            terminal_commands::delete_quick_command,
            terminal_commands::list_command_history,
            terminal_commands::record_command_history,
            terminal_commands::clear_command_history,
            mailpit_commands::list_mailpit_messages,
            mailpit_commands::read_mailpit_message,
            mailpit_commands::delete_mailpit_message,
            mailpit_commands::check_mailpit_message,
            mailpit_commands::release_mailpit_message,
            site_commands::list_sites,
            site_commands::create_site,
            site_commands::operate_site,
            site_commands::create_project_environment,
            site_commands::provision_site_in_environment,
            site_commands::update_site,
            site_commands::duplicate_site,
            site_commands::delete_site,
            project_export_commands::export_project,
            project_export_commands::import_project_bundle,
            git_commands::site_git_status,
            git_commands::initialize_site_git,
            git_commands::open_site_git_remote,
            git_commands::site_git_action,
            git_commands::site_git_details,
            git_commands::site_git_checkout,
            site_commands::repair_site_permissions,
            settings_commands::load_settings,
            settings_commands::save_settings
        ])
        .build(tauri::generate_context!())
        .expect("failed to build LS Panel")
        .run(|app_handle, event| match event {
            tauri::RunEvent::ExitRequested { api, code, .. } => {
                if !app_shutdown::is_complete() {
                    api.prevent_exit();
                    if !app_shutdown::is_running() {
                        let app = app_handle.clone();
                        std::thread::spawn(move || {
                            app_shutdown::run(&app);
                            app.exit(code.unwrap_or(0));
                        });
                    }
                }
            }
            tauri::RunEvent::Exit => {
                app_shutdown::run(app_handle);
            }
            _ => {}
        });
}
