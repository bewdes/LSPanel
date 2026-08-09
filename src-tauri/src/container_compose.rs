use std::path::Path;

use crate::container_schema::Environment;

pub(crate) fn site_hostnames(site: &crate::sites::Site) -> String {
    std::iter::once(site.domain.as_str())
        .chain(site.aliases.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join(" ")
}

pub(crate) fn site_document_root(site: &crate::sites::Site) -> String {
    let suffix = if matches!(site.project_type.as_str(), "laravel" | "symfony") {
        "/app/public"
    } else {
        "/app"
    };
    format!("/var/www/sites/{}{}", site.name, suffix)
}

pub(crate) fn php_dockerfile(environment: &Environment, owner_uid: u32, owner_gid: u32) -> String {
    let php_variant = if environment.web_server == "Nginx" {
        "fpm"
    } else {
        "apache"
    };
    let mut extensions = environment.php_extensions.clone();
    if environment.php_xdebug && !extensions.iter().any(|extension| extension == "xdebug") {
        extensions.push("xdebug".into());
    }
    let database_driver = if environment.database == "PostgreSQL" {
        "pdo_pgsql"
    } else {
        "pdo_mysql"
    };
    if !extensions
        .iter()
        .any(|extension| extension == database_driver)
    {
        extensions.push(database_driver.into());
    }
    let mut dockerfile = format!("FROM docker.io/library/php:{}-{}\nCOPY --from=docker.io/library/composer:{} /usr/bin/composer /usr/local/bin/composer\nCOPY --from=ghcr.io/mlocati/php-extension-installer:latest /usr/bin/install-php-extensions /usr/local/bin/\n", environment.php_version, php_variant, environment.composer_version);
    dockerfile.push_str(&format!(
        "RUN install-php-extensions {}\n",
        extensions.join(" ")
    ));
    // The bind-mounted site files keep the host user's uid/gid. Realign www-data to match
    // so php-fpm/apache workers (which run as www-data, not root) can actually write to them —
    // otherwise every write (uploads, caches, license/activation files) fails with EACCES.
    dockerfile.push_str(&format!(
        "RUN groupmod -g {gid} www-data && usermod -u {uid} -g {gid} www-data\n",
        uid = owner_uid,
        gid = owner_gid
    ));
    if environment
        .extra_services
        .iter()
        .any(|service| service == "mailpit")
    {
        dockerfile.push_str("RUN apt-get update && apt-get install -y --no-install-recommends msmtp-mta && rm -rf /var/lib/apt/lists/* && touch /var/log/msmtp.log && chmod 666 /var/log/msmtp.log\nCOPY msmtprc /etc/msmtprc\nCOPY mailpit.ini /usr/local/etc/php/conf.d/99-mailpit.ini\nRUN chmod 644 /etc/msmtprc\n");
    }
    if environment.php_cron {
        dockerfile.push_str("RUN apt-get update && apt-get install -y --no-install-recommends cron && rm -rf /var/lib/apt/lists/*\nCOPY lspanel-cron /etc/cron.d/lspanel\nRUN chmod 0644 /etc/cron.d/lspanel\n");
    }
    dockerfile.push_str("COPY php-overrides.ini /usr/local/etc/php/conf.d/90-lspanel.ini\n");
    if environment.web_server == "Nginx" {
        dockerfile
            .push_str("COPY php-fpm-overrides.conf /usr/local/etc/php-fpm.d/zz-lspanel.conf\n");
    }
    if environment.web_server == "Apache" {
        dockerfile.push_str("RUN a2enmod rewrite\n");
    }
    dockerfile
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn compose(
    e: &Environment,
    sites_directory: &Path,
    sites: &[crate::sites::Site],
    database_directory: &Path,
    redis_directory: &Path,
    elasticsearch_directory: &Path,
    minio_directory: &Path,
    rabbitmq_directory: &Path,
) -> String {
    // Every generated environment joins the external `lspanel` network. These
    // stable aliases let applications reach services in sibling projects
    // without publishing database/cache ports on the host.
    let network_name = e.name.replace('_', "-").to_ascii_lowercase();
    let db_image = match e.database.as_str() {
        "MariaDB" => "docker.io/library/mariadb",
        "PostgreSQL" => "docker.io/library/postgres",
        _ => "docker.io/library/mysql",
    };
    let db_environment = if e.database == "PostgreSQL" {
        format!(
            "POSTGRES_DB: {}\n      POSTGRES_USER: {}\n      POSTGRES_PASSWORD: {}",
            e.database_name, e.database_user, e.database_password
        )
    } else {
        format!("MYSQL_DATABASE: {}\n      MYSQL_USER: {}\n      MYSQL_PASSWORD: {}\n      MYSQL_ROOT_PASSWORD: {}", e.database_name, e.database_user, e.database_password, e.database_root_password)
    };
    let site_rw =
        serde_json::to_string(&format!("{}:/var/www/sites", sites_directory.display())).unwrap();
    let site_ro =
        serde_json::to_string(&format!("{}:/var/www/sites:ro", sites_directory.display())).unwrap();
    let web_container_name = if e.web_container_name.is_empty() {
        format!("{}-web", e.name)
    } else {
        e.web_container_name.clone()
    };
    let database_container_name = if e.database_container_name.is_empty() {
        format!("{}-database", e.name)
    } else {
        e.database_container_name.clone()
    };
    let custom_environment = if e.environment_variables.is_empty() {
        String::new()
    } else {
        format!(
            "    environment:\n{}",
            e.environment_variables
                .iter()
                .map(|(key, value)| format!(
                    "      {}: {}\n",
                    key,
                    serde_json::to_string(value).unwrap()
                ))
                .collect::<String>()
        )
    };
    let xdebug_host = if e.php_xdebug {
        "    extra_hosts:\n      - \"host.docker.internal:host-gateway\"\n"
    } else {
        ""
    };
    let app = if e.web_server == "Nginx" {
        format!("  web:\n    container_name: {}\n    image: docker.io/library/nginx:{}\n    volumes:\n      - {}\n      - ./default.conf:/etc/nginx/conf.d/default.conf:ro\n    depends_on: [php]\n    healthcheck:\n      test: [\"CMD\", \"nginx\", \"-t\"]\n      interval: 10s\n      timeout: 3s\n      retries: 5\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}\", \"web.{}.localhost\"]\n  php:\n    build:\n      context: .\n      dockerfile: Dockerfile.php\n{}{}    volumes: [{}]\n    depends_on: [database]\n    healthcheck:\n      test: [\"CMD\", \"php-fpm\", \"-t\"]\n      interval: 10s\n      timeout: 3s\n      retries: 5\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"php.{}.localhost\"]\n", web_container_name, e.web_version, site_ro, e.id, network_name, custom_environment, xdebug_host, site_rw, network_name)
    } else {
        format!("  web:\n    container_name: {}\n    build:\n      context: .\n      dockerfile: Dockerfile.php\n{}{}    volumes:\n      - {}\n      - ./000-default.conf:/etc/apache2/sites-enabled/000-default.conf:ro\n    depends_on: [database]\n    healthcheck:\n      test: [\"CMD\", \"php\", \"-r\", \"exit(fsockopen('127.0.0.1', 80) ? 0 : 1);\"]\n      interval: 10s\n      timeout: 3s\n      retries: 5\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}\", \"web.{}.localhost\", \"php.{}.localhost\"]\n", web_container_name, custom_environment, xdebug_host, site_rw, e.id, network_name, network_name)
    };
    let mut extras = String::new();
    if e.php_cron {
        let cron_working_directory = sites
            .first()
            .map(|site| format!("/var/www/sites/{}/app", site.name))
            .unwrap_or_else(|| "/var/www/sites".into());
        extras.push_str(&format!("  cron:\n    build:\n      context: .\n      dockerfile: Dockerfile.php\n    command: [\"cron\", \"-f\"]\n    working_dir: {}\n    volumes: [{}]\n    depends_on: [database]\n    networks:\n      default: {{}}\n      lspanel: {{}}\n", cron_working_directory, site_rw));
    }
    if e.extra_services.iter().any(|item| item == "redis") {
        let password_args = if e.redis_password.is_empty() {
            String::new()
        } else {
            format!(", \"--requirepass\", \"{}\"", e.redis_password)
        };
        let health_auth = if e.redis_password.is_empty() {
            String::new()
        } else {
            format!(", \"-a\", \"{}\"", e.redis_password)
        };
        let redis_volume_mount =
            serde_json::to_string(&format!("{}:/data", redis_directory.display())).unwrap();
        extras.push_str(&format!("  redis:\n    image: docker.io/library/redis:{}-alpine\n    command: [\"redis-server\", \"--appendonly\", \"yes\", \"--maxmemory\", \"{}\", \"--maxmemory-policy\", \"{}\"{}]\n    volumes: [{}]\n    healthcheck:\n      test: [\"CMD\", \"redis-cli\"{}, \"ping\"]\n      interval: 10s\n      timeout: 3s\n      retries: 5\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"redis.{}.localhost\"]\n", e.redis_version, e.redis_memory_limit, e.redis_eviction_policy, password_args, redis_volume_mount, health_auth, network_name));
    }
    if e.extra_services.iter().any(|item| item == "elasticsearch") {
        let elasticsearch_volume_mount = serde_json::to_string(&format!(
            "{}:/usr/share/elasticsearch/data",
            elasticsearch_directory.display()
        ))
        .unwrap();
        extras.push_str(&format!("  elasticsearch:\n    image: docker.elastic.co/elasticsearch/elasticsearch:{}\n    environment:\n      discovery.type: single-node\n      xpack.security.enabled: \"false\"\n      ES_JAVA_OPTS: \"-Xms{} -Xmx{}\"\n    volumes: [{}]\n    healthcheck:\n      test: [\"CMD-SHELL\", \"curl -sf http://127.0.0.1:9200/_cluster/health || exit 1\"]\n      interval: 10s\n      timeout: 5s\n      retries: 10\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}-elasticsearch\", \"elasticsearch.{}.localhost\"]\n", e.elasticsearch_version, e.elasticsearch_memory_limit, e.elasticsearch_memory_limit, elasticsearch_volume_mount, e.id, network_name));
    }
    if e.extra_services.iter().any(|item| item == "minio") {
        let minio_volume_mount =
            serde_json::to_string(&format!("{}:/data", minio_directory.display())).unwrap();
        extras.push_str(&format!("  minio:\n    image: docker.io/minio/minio:{}\n    command: [\"server\", \"/data\", \"--console-address\", \":9001\"]\n    environment:\n      MINIO_ROOT_USER: {}\n      MINIO_ROOT_PASSWORD: {}\n    volumes: [{}]\n    healthcheck:\n      test: [\"CMD\", \"mc\", \"ready\", \"local\"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}-minio\", \"minio.{}.localhost\"]\n", e.minio_version, serde_json::to_string(&e.minio_root_user).unwrap(), serde_json::to_string(&e.minio_root_password).unwrap(), minio_volume_mount, e.id, network_name));
    }
    if e.extra_services.iter().any(|item| item == "rabbitmq") {
        let rabbitmq_volume_mount = serde_json::to_string(&format!(
            "{}:/var/lib/rabbitmq",
            rabbitmq_directory.display()
        ))
        .unwrap();
        extras.push_str(&format!("  rabbitmq:\n    image: docker.io/library/rabbitmq:{}-management\n    environment:\n      RABBITMQ_DEFAULT_USER: {}\n      RABBITMQ_DEFAULT_PASS: {}\n    volumes: [{}]\n    healthcheck:\n      test: [\"CMD\", \"rabbitmq-diagnostics\", \"-q\", \"ping\"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}-rabbitmq\", \"rabbitmq.{}.localhost\"]\n", e.rabbitmq_version, serde_json::to_string(&e.rabbitmq_user).unwrap(), serde_json::to_string(&e.rabbitmq_password).unwrap(), rabbitmq_volume_mount, e.id, network_name));
    }
    if e.extra_services.iter().any(|item| item == "node") {
        let install = if e.node_auto_install {
            format!(
                "if [ -f package.json ]; then {} install; fi; ",
                e.node_package_manager
            )
        } else {
            String::new()
        };
        let corepack = if e.node_package_manager == "npm" {
            String::new()
        } else {
            "corepack enable; ".into()
        };
        let configured_command = if e.node_run_mode == "start" {
            e.node_start_command.trim()
        } else {
            e.node_dev_command.trim()
        };
        let command = if !configured_command.is_empty() {
            configured_command
        } else if !e.node_command.trim().is_empty() {
            e.node_command.trim()
        } else {
            "tail -f /dev/null"
        };
        // "start" mode is a production-style run (built once, then served) —
        // build before every start/restart, same as `install` above. "dev"
        // mode never builds: its whole point is running straight off source
        // with hot reload, so node_build_command is intentionally unused there.
        let build = if e.node_run_mode == "start" && !e.node_build_command.trim().is_empty() {
            format!("{}; ", e.node_build_command.trim())
        } else {
            String::new()
        };
        let startup =
            serde_json::to_string(&format!("{}{}{}{}", corepack, install, build, command)).unwrap();
        let inspector_port = if e.node_inspector {
            format!(
                "    ports: [\"127.0.0.1:{0}:{0}\"]\n",
                e.node_inspector_port
            )
        } else {
            String::new()
        };
        let inspector_environment = if e.node_inspector {
            format!(
                "    environment:\n      NODE_OPTIONS: \"--inspect=0.0.0.0:{}\"\n",
                e.node_inspector_port
            )
        } else {
            String::new()
        };
        let working_dir = sites
            .iter()
            .find(|site| crate::project_templates::is_node_project(&site.project_type))
            .map(|site| format!("/var/www/sites/{}/app", site.name))
            .unwrap_or_else(|| "/var/www/sites".into());
        extras.push_str(&format!("  node:\n    image: docker.io/library/node:{}-alpine\n    command: [\"sh\", \"-lc\", {}]\n    working_dir: {}\n{}{}    volumes: [{}]\n    healthcheck:\n      test: [\"CMD\", \"wget\", \"-qO-\", \"http://127.0.0.1:3000\"]\n      interval: 10s\n      timeout: 3s\n      retries: 10\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}-node\", \"node.{}.localhost\"]\n", e.node_version, startup, working_dir, inspector_environment, inspector_port, site_rw, e.id, network_name));
    }
    if e.extra_services.iter().any(|item| item == "mailpit") {
        extras.push_str(&format!("  mailpit:\n    image: docker.io/axllent/mailpit:v1.27\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}-mailpit\"]\n", e.id));
    }
    if e.extra_services.iter().any(|item| item == "adminer") {
        let driver = if e.database == "PostgreSQL" {
            "pgsql"
        } else {
            "server"
        };
        let port = if e.database == "PostgreSQL" {
            5432
        } else {
            3306
        };
        let dsn = serde_json::to_string(&format!(
            "{}://{}:{}@database:{}/{}",
            driver, e.database_user, e.database_password, port, e.database_name
        ))
        .unwrap();
        extras.push_str(&format!("  adminer:\n    image: docker.io/dockette/adminer:full\n    environment:\n      ADMINER_PLUGIN_AUTOLOGIN: \"1\"\n      ADMINER_AUTOLOGIN_SERVER: {}\n    depends_on: [database]\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}-adminer\"]\n", dsn, e.id));
    }
    if e.extra_services.iter().any(|item| item == "phpmyadmin") {
        extras.push_str(&format!("  phpmyadmin:\n    image: docker.io/library/phpmyadmin:5-apache\n    environment:\n      PMA_HOST: database\n      PMA_USER: {}\n      PMA_PASSWORD: {}\n    depends_on: [database]\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}-phpmyadmin\"]\n", e.database_user, e.database_password, e.id));
    }
    let database_healthcheck = if e.database == "PostgreSQL" {
        format!(
            "[\"CMD-SHELL\", \"pg_isready -U {} -d {}\"]",
            e.database_user, e.database_name
        )
    } else {
        let admin = if e.database == "MariaDB" {
            "mariadb-admin"
        } else {
            "mysqladmin"
        };
        serde_json::to_string(&[
            "CMD",
            admin,
            "ping",
            "-h",
            "127.0.0.1",
            "-uroot",
            &format!("-p{}", e.database_root_password),
            "--silent",
        ])
        .unwrap()
    };
    let database_volume_mount = serde_json::to_string(&format!(
        "{}:/var/lib/{}",
        database_directory.display(),
        if e.database == "PostgreSQL" {
            "postgresql/data"
        } else {
            "mysql"
        }
    ))
    .unwrap();
    apply_runtime_defaults(format!("name: {}\nservices:\n{}  database:\n    container_name: {}\n    image: {}:{}\n    environment:\n      {}\n    volumes: [{}]\n    healthcheck:\n      test: {}\n      interval: 10s\n      timeout: 5s\n      retries: 10\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"database.{}.localhost\"]\n{}networks:\n  default: {{}}\n  lspanel:\n    external: true\n", e.name, app, database_container_name, db_image, e.database_version, db_environment, database_volume_mount, database_healthcheck, network_name, extras), e)
}

fn apply_runtime_defaults(mut yaml: String, environment: &Environment) -> String {
    for service in [
        "web",
        "php",
        "database",
        "redis",
        "elasticsearch",
        "minio",
        "rabbitmq",
        "node",
        "mailpit",
        "adminer",
        "phpmyadmin",
        "cron",
    ] {
        let heading = format!("  {service}:\n");
        if yaml.contains(&heading) {
            let restart = if service == "node" && !environment.node_auto_restart {
                "no"
            } else {
                &environment.restart_policy
            };
            let settings = format!(
                "    restart: {}\n    cpus: {}\n    mem_limit: {}\n",
                restart,
                serde_json::to_string(&environment.cpu_limit).unwrap(),
                environment.container_memory_limit
            );
            yaml = yaml.replacen(&heading, &format!("{heading}{settings}"), 1);
        }
    }
    yaml
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::container_validation::validate;
    use std::collections::BTreeMap;

    fn test_site(project_type: &str) -> crate::sites::Site {
        crate::sites::Site {
            id: "site-test".into(),
            name: "demo".into(),
            domain: "demo.localhost".into(),
            environment_id: "env-test".into(),
            directory: "/tmp/demo".into(),
            project_type: project_type.into(),
            auto_init_git: false,
            pinned: false,
            archived: false,
            enabled: true,
            group: String::new(),
            tags: vec![],
            aliases: vec![],
            created_at: 0,
            last_started_at: None,
        }
    }

    fn test_environment() -> Environment {
        Environment {
            id: "demo".into(),
            name: "demo".into(),
            web_server: "Nginx".into(),
            web_version: "1.28".into(),
            php_version: "8.4".into(),
            database: "MariaDB".into(),
            database_version: "11.8".into(),
            port: "8080".into(),
            web_container_name: "custom-web".into(),
            database_container_name: "custom-db".into(),
            php_extensions: vec!["intl".into()],
            extra_services: vec!["redis".into(), "node".into()],
            node_version: "22".into(),
            redis_version: "7.4".into(),
            database_name: "website".into(),
            database_user: "website_user".into(),
            database_password: "secret".into(),
            database_root_password: "root-secret".into(),
            php_memory_limit: "256M".into(),
            php_upload_limit: "64M".into(),
            php_post_limit: "64M".into(),
            php_execution_time: 120,
            php_jit: false,
            php_jit_mode: "tracing".into(),
            php_jit_buffer_size: "64M".into(),
            php_cron: false,
            php_cron_schedule: "* * * * *".into(),
            php_cron_command: "php artisan schedule:run".into(),
            php_fpm_process_manager: "dynamic".into(),
            php_fpm_max_children: 10,
            php_fpm_start_servers: 2,
            php_fpm_min_spare_servers: 1,
            php_fpm_max_spare_servers: 3,
            php_fpm_max_requests: 500,
            php_xdebug: false,
            php_xdebug_mode: "develop,debug".into(),
            php_xdebug_port: 9003,
            php_xdebug_start: "trigger".into(),
            php_xdebug_ide_key: "LSPANEL".into(),
            environment_variables: BTreeMap::from([("APP_ENV".into(), "local".into())]),
            redis_password: "redis-secret".into(),
            redis_memory_limit: "256mb".into(),
            redis_eviction_policy: "allkeys-lru".into(),
            elasticsearch_version: "8.15.3".into(),
            elasticsearch_memory_limit: "512m".into(),
            minio_version: "RELEASE.2024-11-07T00-52-20Z".into(),
            minio_root_user: "minioadmin".into(),
            minio_root_password: "minioadmin123".into(),
            rabbitmq_version: "3.13".into(),
            rabbitmq_user: "guest".into(),
            rabbitmq_password: "guest".into(),
            node_package_manager: "pnpm".into(),
            node_auto_install: true,
            node_auto_restart: true,
            node_command: "pnpm dev".into(),
            node_run_mode: "dev".into(),
            node_dev_command: "pnpm dev".into(),
            node_build_command: "pnpm build".into(),
            node_start_command: "pnpm start".into(),
            node_inspector: false,
            node_inspector_port: 9229,
            runtime_mode: "container".into(),
            composer_version: "2".into(),
            restart_policy: "unless-stopped".into(),
            cpu_limit: "2.0".into(),
            container_memory_limit: "2g".into(),
            wordpress_site_title: String::new(),
            wordpress_admin_user: String::new(),
            wordpress_admin_password: String::new(),
            wordpress_admin_email: String::new(),
            backup_schedule_enabled: false,
            backup_schedule_interval_hours: 24,
            backup_retention_count: 7,
        }
    }

    #[test]
    fn document_root_prefers_framework_public_folder() {
        assert_eq!(
            site_document_root(&test_site("php")),
            "/var/www/sites/demo/app"
        );
        assert_eq!(
            site_document_root(&test_site("wordpress")),
            "/var/www/sites/demo/app"
        );
        assert_eq!(
            site_document_root(&test_site("laravel")),
            "/var/www/sites/demo/app/public"
        );
        assert_eq!(
            site_document_root(&test_site("symfony")),
            "/var/www/sites/demo/app/public"
        );
    }

    #[test]
    fn xdebug_adds_extension_host_gateway_and_validates_settings() {
        let mut environment = test_environment();
        environment.php_xdebug = true;
        validate(&environment).unwrap();
        let dockerfile = php_dockerfile(&environment, 1000, 1000);
        assert!(dockerfile.contains("intl xdebug pdo_mysql"));
        assert!(
            dockerfile.contains("groupmod -g 1000 www-data && usermod -u 1000 -g 1000 www-data")
        );
        let yaml = compose(
            &environment,
            Path::new("/tmp/LSP Sites"),
            &[],
            Path::new("/tmp/lspanel-test-db"),
            Path::new("/tmp/lspanel-test-redis"),
            Path::new("/tmp/lspanel-test-es"),
            Path::new("/tmp/lspanel-test-minio"),
            Path::new("/tmp/lspanel-test-rabbitmq"),
        );
        assert!(yaml.contains("host.docker.internal:host-gateway"));

        environment.php_xdebug_mode = "trace".into();
        assert!(validate(&environment).is_err());
    }

    #[test]
    fn node_inspector_is_bound_to_loopback_only() {
        let mut environment = test_environment();
        environment.node_inspector = true;
        environment.node_inspector_port = 9230;
        validate(&environment).unwrap();
        let yaml = compose(
            &environment,
            Path::new("/tmp/LSP Sites"),
            &[],
            Path::new("/tmp/lspanel-test-db"),
            Path::new("/tmp/lspanel-test-redis"),
            Path::new("/tmp/lspanel-test-es"),
            Path::new("/tmp/lspanel-test-minio"),
            Path::new("/tmp/lspanel-test-rabbitmq"),
        );
        assert!(yaml.contains("NODE_OPTIONS: \"--inspect=0.0.0.0:9230\""));
        assert!(yaml.contains("127.0.0.1:9230:9230"));
        assert!(!yaml.contains("ports: [\"9230:9230\"]"));
    }

    #[test]
    fn node_start_mode_runs_the_build_command_before_starting() {
        // Regression test: node_build_command was collected in the wizard,
        // validated, and persisted, but never actually executed anywhere.
        let mut environment = test_environment();
        environment.node_run_mode = "start".into();
        validate(&environment).unwrap();
        let yaml = compose(
            &environment,
            Path::new("/tmp/LSP Sites"),
            &[],
            Path::new("/tmp/lspanel-test-db"),
            Path::new("/tmp/lspanel-test-redis"),
            Path::new("/tmp/lspanel-test-es"),
            Path::new("/tmp/lspanel-test-minio"),
            Path::new("/tmp/lspanel-test-rabbitmq"),
        );
        let build_at = yaml.find("pnpm build").expect("build command missing");
        let start_at = yaml.find("pnpm start").expect("start command missing");
        assert!(
            build_at < start_at,
            "build command must run before the start command"
        );
    }

    #[test]
    fn node_dev_mode_never_runs_the_build_command() {
        let mut environment = test_environment();
        environment.node_run_mode = "dev".into();
        validate(&environment).unwrap();
        let yaml = compose(
            &environment,
            Path::new("/tmp/LSP Sites"),
            &[],
            Path::new("/tmp/lspanel-test-db"),
            Path::new("/tmp/lspanel-test-redis"),
            Path::new("/tmp/lspanel-test-es"),
            Path::new("/tmp/lspanel-test-minio"),
            Path::new("/tmp/lspanel-test-rabbitmq"),
        );
        assert!(!yaml.contains("pnpm build"));
        assert!(yaml.contains("pnpm dev"));
    }

    #[test]
    fn nginx_compose_contains_services_and_project_path() {
        let environment = test_environment();
        let yaml = compose(
            &environment,
            Path::new("/tmp/LSP Sites/demo"),
            &[],
            Path::new("/tmp/lspanel-test-db"),
            Path::new("/tmp/lspanel-test-redis"),
            Path::new("/tmp/lspanel-test-es"),
            Path::new("/tmp/lspanel-test-minio"),
            Path::new("/tmp/lspanel-test-rabbitmq"),
        );
        let dockerfile = php_dockerfile(&environment, 1000, 1000);
        assert!(yaml.contains("nginx:1.28"));
        assert!(yaml.contains("dockerfile: Dockerfile.php"));
        assert!(yaml.contains("mariadb:11.8"));
        assert!(yaml.contains("/tmp/LSP Sites/demo:/var/www/sites"));
        assert!(yaml.contains("aliases: [\"lsp-demo\", \"web.demo.localhost\"]"));
        assert!(yaml.contains("container_name: custom-web"));
        assert!(yaml.contains("container_name: custom-db"));
        assert!(yaml.contains("MYSQL_DATABASE: website"));
        assert!(yaml.contains("MYSQL_USER: website_user"));
        assert!(yaml.contains("redis:7.4-alpine"));
        assert!(yaml.contains("--requirepass"));
        assert!(yaml.contains("redis-secret"));
        assert!(yaml.contains("--maxmemory-policy"));
        assert!(yaml.contains("corepack enable;"));
        assert!(yaml.contains("pnpm install"));
        assert!(yaml.contains("pnpm dev"));
        assert!(yaml.contains("restart: unless-stopped"));
        assert!(yaml.contains("cpus: \"2.0\""));
        assert!(yaml.contains("mem_limit: 2g"));
        assert!(yaml.contains("node:22-alpine"));
        assert!(yaml.contains("networks:\n  default: {}"));
        assert!(yaml.contains("lspanel:\n    external: true"));
        assert!(yaml.contains("\"web.demo.localhost\""));
        assert!(yaml.contains("\"php.demo.localhost\""));
        assert!(yaml.contains("\"database.demo.localhost\""));
        assert!(yaml.contains("\"redis.demo.localhost\""));
        assert!(!yaml.contains("8080:80"));
        assert!(dockerfile
            .contains("COPY php-fpm-overrides.conf /usr/local/etc/php-fpm.d/zz-lspanel.conf"));

        let mut invalid = environment;
        invalid.php_fpm_process_manager = "invalid".into();
        assert!(validate(&invalid).is_err());
    }

    #[test]
    fn extra_services_generate_elasticsearch_minio_and_rabbitmq_containers() {
        let mut environment = test_environment();
        environment.extra_services =
            vec!["elasticsearch".into(), "minio".into(), "rabbitmq".into()];
        assert!(validate(&environment).is_ok());
        let yaml = compose(
            &environment,
            Path::new("/tmp/LSP Sites/demo"),
            &[],
            Path::new("/tmp/lspanel-test-db"),
            Path::new("/tmp/lspanel-test-redis"),
            Path::new("/tmp/lspanel-test-es"),
            Path::new("/tmp/lspanel-test-minio"),
            Path::new("/tmp/lspanel-test-rabbitmq"),
        );
        assert!(yaml.contains("  elasticsearch:\n"));
        assert!(yaml.contains("docker.elastic.co/elasticsearch/elasticsearch:8.15.3"));
        assert!(yaml.contains("discovery.type: single-node"));
        assert!(yaml.contains("/tmp/lspanel-test-es:/usr/share/elasticsearch/data"));
        assert!(yaml
            .contains("aliases: [\"lsp-demo-elasticsearch\", \"elasticsearch.demo.localhost\"]"));
        assert!(yaml.contains("  minio:\n"));
        assert!(yaml.contains("docker.io/minio/minio:RELEASE.2024-11-07T00-52-20Z"));
        assert!(yaml.contains("MINIO_ROOT_USER: \"minioadmin\""));
        assert!(yaml.contains("/tmp/lspanel-test-minio:/data"));
        assert!(yaml.contains("aliases: [\"lsp-demo-minio\", \"minio.demo.localhost\"]"));
        assert!(yaml.contains("  rabbitmq:\n"));
        assert!(yaml.contains("docker.io/library/rabbitmq:3.13-management"));
        assert!(yaml.contains("RABBITMQ_DEFAULT_USER: \"guest\""));
        assert!(yaml.contains("/tmp/lspanel-test-rabbitmq:/var/lib/rabbitmq"));
        assert!(yaml.contains("aliases: [\"lsp-demo-rabbitmq\", \"rabbitmq.demo.localhost\"]"));

        let mut invalid = environment.clone();
        invalid.minio_root_password = "short".into();
        assert!(validate(&invalid).is_err());
        let mut invalid = environment;
        invalid.rabbitmq_password = String::new();
        assert!(validate(&invalid).is_err());
    }

    #[test]
    fn php_cron_generates_a_dedicated_service_and_validates_schedule() {
        let mut environment = test_environment();
        environment.php_cron = true;
        environment.php_cron_schedule = "*/5 * * * *".into();
        environment.php_cron_command = "php artisan schedule:run".into();

        validate(&environment).unwrap();
        let yaml = compose(
            &environment,
            Path::new("/tmp/LSP Sites/demo"),
            &[],
            Path::new("/tmp/lspanel-test-db"),
            Path::new("/tmp/lspanel-test-redis"),
            Path::new("/tmp/lspanel-test-es"),
            Path::new("/tmp/lspanel-test-minio"),
            Path::new("/tmp/lspanel-test-rabbitmq"),
        );
        assert!(yaml.contains("  cron:\n"));
        assert!(yaml.contains("command: [\"cron\", \"-f\"]"));
        assert!(yaml.contains("working_dir: /var/www/sites"));
        assert!(yaml.contains("aliases: [\"php.demo.localhost\"]"));
        assert_eq!(
            yaml.matches("lspanel: {}").count(),
            1,
            "cron joins the shared network; PHP declares its stable alias"
        );
        assert!(php_dockerfile(&environment, 1000, 1000)
            .contains("COPY lspanel-cron /etc/cron.d/lspanel"));

        environment.php_cron_schedule = "every minute".into();
        assert!(validate(&environment).is_err());
    }

    #[test]
    fn container_configuration_matrix_generates_real_services() {
        for web_server in ["Apache", "Nginx"] {
            for database in ["MySQL", "MariaDB", "PostgreSQL"] {
                let mut environment = test_environment();
                environment.web_server = web_server.into();
                environment.database = database.into();
                environment.database_version = match database {
                    "MySQL" => "8.4",
                    "MariaDB" => "11.8",
                    _ => "17",
                }
                .into();
                environment.php_extensions = vec!["gd".into(), "intl".into(), "redis".into()];
                environment.extra_services = vec![
                    "redis".into(),
                    "node".into(),
                    "mailpit".into(),
                    "adminer".into(),
                ];

                validate(&environment).unwrap();
                let yaml = compose(
                    &environment,
                    Path::new("/tmp/LSP Sites/demo"),
                    &[],
                    Path::new("/tmp/lspanel-test-db"),
                    Path::new("/tmp/lspanel-test-redis"),
                    Path::new("/tmp/lspanel-test-es"),
                    Path::new("/tmp/lspanel-test-minio"),
                    Path::new("/tmp/lspanel-test-rabbitmq"),
                );
                let dockerfile = php_dockerfile(&environment, 1000, 1000);

                assert!(yaml.contains("  web:\n"));
                assert!(yaml.contains("  database:\n"));
                assert!(yaml.contains("  redis:\n"));
                assert!(yaml.contains("  node:\n"));
                assert!(yaml.contains("  mailpit:\n"));
                assert!(yaml.contains("  adminer:\n"));
                assert!(dockerfile.contains(if web_server == "Nginx" {
                    "php:8.4-fpm"
                } else {
                    "php:8.4-apache"
                }));
                assert!(dockerfile.contains("install-php-extensions gd intl redis"));
                assert!(dockerfile.contains(if database == "PostgreSQL" {
                    "pdo_pgsql"
                } else {
                    "pdo_mysql"
                }));
                assert!(dockerfile.contains("msmtp-mta"));
                assert_eq!(
                    dockerfile.contains("a2enmod rewrite"),
                    web_server == "Apache"
                );
                assert!(yaml.contains(match database {
                    "MySQL" => "mysql:8.4",
                    "MariaDB" => "mariadb:11.8",
                    _ => "postgres:17",
                }));
            }
        }
    }

    #[test]
    fn phpmyadmin_is_generated_only_for_mysql_compatible_databases() {
        for database in ["MySQL", "MariaDB"] {
            let mut environment = test_environment();
            environment.database = database.into();
            environment.extra_services = vec!["phpmyadmin".into()];
            validate(&environment).unwrap();
            assert!(compose(
                &environment,
                Path::new("/tmp/sites"),
                &[],
                Path::new("/tmp/lspanel-test-db"),
                Path::new("/tmp/lspanel-test-redis"),
                Path::new("/tmp/lspanel-test-es"),
                Path::new("/tmp/lspanel-test-minio"),
                Path::new("/tmp/lspanel-test-rabbitmq")
            )
            .contains("  phpmyadmin:\n"));
        }

        let mut postgres = test_environment();
        postgres.database = "PostgreSQL".into();
        postgres.extra_services = vec!["phpmyadmin".into()];
        assert!(validate(&postgres).is_err());
    }
}
