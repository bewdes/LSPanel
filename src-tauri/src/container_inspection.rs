use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentInspection {
    pub id: String,
    pub status: String,
    pub provisioned: bool,
    pub running_services: usize,
    pub services: Vec<ServiceInspection>,
    pub logs: String,
    pub site_directory: String,
    pub compose_file: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceInspection {
    pub name: String,
    pub container_name: String,
    pub state: String,
    pub health: String,
    pub cpu: String,
    pub memory: String,
    pub network_io: String,
    pub block_io: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentState {
    pub id: String,
    pub status: String,
}

fn json_values(output: &str) -> Vec<serde_json::Value> {
    serde_json::from_str(output)
        .ok()
        .map(|value| match value {
            serde_json::Value::Array(values) => values,
            value => vec![value],
        })
        .unwrap_or_else(|| {
            output
                .lines()
                .filter_map(|line| serde_json::from_str(line).ok())
                .collect()
        })
}

pub(crate) fn parse_services(output: &str) -> Vec<ServiceInspection> {
    json_values(output)
        .into_iter()
        .filter_map(|value| {
            let name = value
                .get("Service")
                .or_else(|| value.get("service"))?
                .as_str()?
                .to_owned();
            let text = |primary, fallback| {
                value
                    .get(primary)
                    .or_else(|| value.get(fallback))
                    .and_then(|value| value.as_str())
            };
            Some(ServiceInspection {
                container_name: text("Name", "name").unwrap_or(&name).to_owned(),
                state: text("State", "state").unwrap_or("unknown").to_lowercase(),
                health: text("Health", "health")
                    .filter(|value| !value.is_empty())
                    .unwrap_or("none")
                    .to_lowercase(),
                name,
                cpu: String::new(),
                memory: String::new(),
                network_io: String::new(),
                block_io: String::new(),
            })
        })
        .collect()
}

pub(crate) fn apply_stats(services: &mut [ServiceInspection], output: &str) {
    for value in json_values(output) {
        let service = value
            .get("Service")
            .or_else(|| value.get("service"))
            .and_then(|value| value.as_str());
        let name = value
            .get("Name")
            .or_else(|| value.get("name"))
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        if let Some(item) = services.iter_mut().find(|item| {
            service == Some(item.name.as_str()) || name.ends_with(&format!("-{}", item.name))
        }) {
            item.cpu = json_text(&value, ["CPUPerc", "CPU", "cpu_percent"]);
            item.memory = json_text(&value, ["MemUsage", "Memory", "mem_usage"]);
            item.network_io = json_text(&value, ["NetIO", "NetworkIO", "net_io"]);
            item.block_io = json_text(&value, ["BlockIO", "block_io", "BlockInput"]);
            if !item.cpu.is_empty() || !item.memory.is_empty() {
                item.health = format!(
                    "{} · CPU {} · RAM {}",
                    item.health,
                    if item.cpu.is_empty() {
                        "—"
                    } else {
                        &item.cpu
                    },
                    if item.memory.is_empty() {
                        "—"
                    } else {
                        &item.memory
                    }
                );
            }
        }
    }
}

fn json_text<const N: usize>(value: &serde_json::Value, keys: [&str; N]) -> String {
    keys.into_iter()
        .find_map(|key| value.get(key))
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| value.to_string())
        })
        .unwrap_or_default()
}
