# Anthropic API Rectifier Implementation Plan

> 参考 CC-Switch v3.10.0 实现
> 源码仓库: https://github.com/farion1231/cc-switch

## 概述

Rectifier（整流器）是一个自动修复 Anthropic API 请求兼容性问题的中间件系统。它主要解决第三方 API 网关返回的错误格式与官方 API 不兼容的问题，通过检测特定错误并自动修正请求参数后重试。

## 核心架构

### 模块划分

```
rectifier/
├── types.rs              # 配置类型定义
├── thinking_rectifier.rs # Thinking Signature 整流器
└── thinking_budget_rectifier.rs # Thinking Budget 整流器
```

### 配置结构

```rust
pub struct RectifierConfig {
    /// 总开关
    pub enabled: bool,
    /// Thinking Signature 整流开关
    pub request_thinking_signature: bool,
    /// Thinking Budget 整流开关
    pub request_thinking_budget: bool,
}
```

## 一、Thinking Signature Rectifier

### 功能描述

自动修复因签名校验失败导致的请求错误。当上游 API 返回签名相关错误时，系统会自动移除有问题的签名字段并重试请求。

### 错误检测规则

检测函数：`should_rectify_thinking_signature(error_message, config) -> bool`

触发条件（满足任一即触发）：

#### 场景 1：thinking block 中的签名无效
```
错误示例: "Invalid 'signature' in 'thinking' block"
检测逻辑: 同时包含 "invalid" + "signature" + "thinking" + "block"
```

#### 场景 2：assistant 消息必须以 thinking block 开头
```
错误示例: "must start with a thinking block"
检测逻辑: 包含 "must start with a thinking block"
```

#### 场景 3：expected thinking，但发现 tool_use
```
错误示例: "Expected `thinking` or `redacted_thinking`, but found `tool_use`"
检测逻辑: 包含 "expected" + ("thinking" 或 "redacted_thinking") + "found" + "tool_use"
注意: 必须明确包含 "tool_use"，避免过宽匹配
```

#### 场景 4：signature 字段必需但缺失
```
错误示例: "signature: Field required"
检测逻辑: 包含 "signature" + "field required"
```

#### 场景 5：signature 字段不被接受（第三方渠道）
```
错误示例: "xxx.signature: Extra inputs are not permitted"
检测逻辑: 包含 "signature" + "extra inputs are not permitted"
```

#### 场景 6：thinking/redacted_thinking 块被修改
```
错误示例: "thinking or redacted_thinking blocks ... cannot be modified"
检测逻辑: 包含 ("thinking" 或 "redacted_thinking") + "cannot be modified"
```

#### 场景 7：非法请求（兜底）
```
错误示例: "非法请求" / "illegal request" / "invalid request"
检测逻辑: 包含以上任一关键词
```

### 整流算法

函数：`rectify_anthropic_request(body: &mut Value) -> RectifyResult`

#### 步骤 1：清理消息内容

遍历 `body.messages[*].content` 数组：

1. **移除 thinking blocks**
   - 类型为 `"thinking"` 的 block 直接移除
   - 类型为 `"redacted_thinking"` 的 block 直接移除
   - 统计移除数量

2. **移除非 thinking block 上的 signature 字段**
   - 对于 `text`、`tool_use` 等其他类型的 block
   - 如果存在 `signature` 字段，将其移除
   - 统计移除数量

#### 步骤 2：处理顶层 thinking 字段

检查条件（需同时满足）：
- `thinking.type == "enabled"`（仅 enabled 类型需要检查）
- 最后一条 assistant 消息存在
- 该消息的首个 content block 不是 `thinking` 或 `redacted_thinking`
- 该消息包含 `tool_use` block

如果满足以上条件，删除顶层 `thinking` 字段。

#### 返回结果

```rust
pub struct RectifyResult {
    pub applied: bool,  // 是否应用了整流
    pub removed_thinking_blocks: usize,
    pub removed_redacted_thinking_blocks: usize,
    pub removed_signature_fields: usize,
}
```

### 实现代码示例

```rust
pub fn should_rectify_thinking_signature(
    error_message: Option<&str>,
    config: &RectifierConfig,
) -> bool {
    // 检查总开关
    if !config.enabled {
        return false;
    }
    // 检查子开关
    if !config.request_thinking_signature {
        return false;
    }

    let Some(msg) = error_message else {
        return false;
    };
    let lower = msg.to_lowercase();

    // 场景1: thinking block 中的签名无效
    if lower.contains("invalid")
        && lower.contains("signature")
        && lower.contains("thinking")
        && lower.contains("block")
    {
        return true;
    }

    // 场景2: assistant 消息必须以 thinking block 开头
    if lower.contains("must start with a thinking block") {
        return true;
    }

    // 场景3: expected thinking or redacted_thinking, found tool_use
    if lower.contains("expected")
        && (lower.contains("thinking") || lower.contains("redacted_thinking"))
        && lower.contains("found")
        && lower.contains("tool_use")
    {
        return true;
    }

    // 场景4: signature 字段必需但缺失
    if lower.contains("signature") && lower.contains("field required") {
        return true;
    }

    // 场景5: signature 字段不被接受（第三方渠道）
    if lower.contains("signature") && lower.contains("extra inputs are not permitted") {
        return true;
    }

    // 场景6: thinking/redacted_thinking 块被修改
    if (lower.contains("thinking") || lower.contains("redacted_thinking"))
        && lower.contains("cannot be modified")
    {
        return true;
    }

    // 场景7: 非法请求
    if lower.contains("非法请求")
        || lower.contains("illegal request")
        || lower.contains("invalid request")
    {
        return true;
    }

    false
}

pub fn rectify_anthropic_request(body: &mut Value) -> RectifyResult {
    let mut result = RectifyResult::default();

    let messages = match body.get_mut("messages").and_then(|m| m.as_array_mut()) {
        Some(m) => m,
        None => return result,
    };

    // 遍历所有消息
    for msg in messages.iter_mut() {
        let content = match msg.get_mut("content").and_then(|c| c.as_array_mut()) {
            Some(c) => c,
            None => continue,
        };

        let mut new_content = Vec::with_capacity(content.len());
        let mut content_modified = false;

        for block in content.iter() {
            let block_type = block.get("type").and_then(|t| t.as_str());

            match block_type {
                Some("thinking") => {
                    result.removed_thinking_blocks += 1;
                    content_modified = true;
                    continue;
                }
                Some("redacted_thinking") => {
                    result.removed_redacted_thinking_blocks += 1;
                    content_modified = true;
                    continue;
                }
                _ => {}
            }

            // 移除非 thinking block 上的 signature 字段
            if block.get("signature").is_some() {
                let mut block_clone = block.clone();
                if let Some(obj) = block_clone.as_object_mut() {
                    obj.remove("signature");
                    result.removed_signature_fields += 1;
                    content_modified = true;
                    new_content.push(Value::Object(obj.clone()));
                    continue;
                }
            }

            new_content.push(block.clone());
        }

        if content_modified {
            result.applied = true;
            *content = new_content;
        }
    }

    // 处理顶层 thinking 字段
    let messages_snapshot: Vec<Value> = body
        .get("messages")
        .and_then(|m| m.as_array())
        .map(|a| a.to_vec())
        .unwrap_or_default();

    if should_remove_top_level_thinking(body, &messages_snapshot) {
        if let Some(obj) = body.as_object_mut() {
            obj.remove("thinking");
            result.applied = true;
        }
    }

    result
}

fn should_remove_top_level_thinking(body: &Value, messages: &[Value]) -> bool {
    // 检查 thinking 是否启用
    let thinking_type = body
        .get("thinking")
        .and_then(|t| t.get("type"))
        .and_then(|t| t.as_str());

    // 仅 type=enabled 视为开启
    let thinking_enabled = thinking_type == Some("enabled");

    if !thinking_enabled {
        return false;
    }

    // 找到最后一条 assistant 消息
    let last_assistant = messages
        .iter()
        .rev()
        .find(|m| m.get("role").and_then(|r| r.as_str()) == Some("assistant"));

    let last_assistant_content = match last_assistant
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_array())
    {
        Some(c) if !c.is_empty() => c,
        _ => return false,
    };

    // 检查首块是否为 thinking/redacted_thinking
    let first_block_type = last_assistant_content
        .first()
        .and_then(|b| b.get("type"))
        .and_then(|t| t.as_str());

    let missing_thinking_prefix =
        first_block_type != Some("thinking") && first_block_type != Some("redacted_thinking");

    if !missing_thinking_prefix {
        return false;
    }

    // 检查是否存在 tool_use
    last_assistant_content
        .iter()
        .any(|b| b.get("type").and_then(|t| t.as_str()) == Some("tool_use"))
}
```

## 二、Thinking Budget Rectifier

### 功能描述

自动修复因 thinking budget 约束导致的请求错误。当上游 API 返回 budget_tokens 相关错误时，系统会自动调整 budget 参数并重试。

### 常量定义

```rust
const MAX_THINKING_BUDGET: u64 = 32000;
const MAX_TOKENS_VALUE: u64 = 64000;
const MIN_MAX_TOKENS_FOR_BUDGET: u64 = MAX_THINKING_BUDGET + 1; // 32001
```

### 错误检测规则

检测函数：`should_rectify_thinking_budget(error_message, config) -> bool`

触发条件（需同时满足）：
- 包含 `"budget_tokens"` 或 `"budget tokens"`
- 包含 `"thinking"`
- 包含以下任一：
  - `"greater than or equal to 1024"`
  - `">= 1024"`
  - `"1024"` + `"input should be"`

### 整流算法

函数：`rectify_thinking_budget(body: &mut Value) -> BudgetRectifyResult`

#### 步骤 1：检查 adaptive 模式

如果 `thinking.type == "adaptive"`，不做任何修改，直接返回。

#### 步骤 2：确保 thinking 对象存在

如果 `thinking` 字段缺失或非对象类型，自动创建空对象。

#### 步骤 3：设置标准 budget 参数

```json
{
  "thinking": {
    "type": "enabled",
    "budget_tokens": 32000
  }
}
```

#### 步骤 4：调整 max_tokens

如果 `max_tokens` 不存在或小于 `32001`，设置为 `64000`。

#### 返回结果

```rust
pub struct BudgetRectifyResult {
    pub applied: bool,
    pub before: BudgetRectifySnapshot,
    pub after: BudgetRectifySnapshot,
}

pub struct BudgetRectifySnapshot {
    pub max_tokens: Option<u64>,
    pub thinking_type: Option<String>,
    pub thinking_budget_tokens: Option<u64>,
}
```

### 实现代码示例

```rust
pub fn should_rectify_thinking_budget(
    error_message: Option<&str>,
    config: &RectifierConfig,
) -> bool {
    // 检查总开关
    if !config.enabled {
        return false;
    }
    // 检查子开关
    if !config.request_thinking_budget {
        return false;
    }

    let Some(msg) = error_message else {
        return false;
    };
    let lower = msg.to_lowercase();

    // 仅在包含 budget_tokens + thinking + 1024 约束时触发
    let has_budget_tokens_reference =
        lower.contains("budget_tokens") || lower.contains("budget tokens");
    let has_thinking_reference = lower.contains("thinking");
    let has_1024_constraint = lower.contains("greater than or equal to 1024")
        || lower.contains(">= 1024")
        || (lower.contains("1024") && lower.contains("input should be"));

    if has_budget_tokens_reference && has_thinking_reference && has_1024_constraint {
        return true;
    }

    false
}

pub fn rectify_thinking_budget(body: &mut Value) -> BudgetRectifyResult {
    let before = snapshot_budget(body);

    // adaptive 请求不改写
    if before.thinking_type.as_deref() == Some("adaptive") {
        return BudgetRectifyResult {
            applied: false,
            before: before.clone(),
            after: before,
        };
    }

    // 缺少/非法 thinking 时自动创建后再整流
    if !body.get("thinking").is_some_and(Value::is_object) {
        body["thinking"] = Value::Object(serde_json::Map::new());
    }

    let Some(thinking) = body.get_mut("thinking").and_then(|t| t.as_object_mut()) else {
        return BudgetRectifyResult {
            applied: false,
            before: before.clone(),
            after: before,
        };
    };

    thinking.insert("type".to_string(), Value::String("enabled".to_string()));
    thinking.insert(
        "budget_tokens".to_string(),
        Value::Number(MAX_THINKING_BUDGET.into()),
    );

    if before.max_tokens.is_none() || before.max_tokens < Some(MIN_MAX_TOKENS_FOR_BUDGET) {
        body["max_tokens"] = Value::Number(MAX_TOKENS_VALUE.into());
    }

    let after = snapshot_budget(body);
    BudgetRectifyResult {
        applied: before != after,
        before,
        after,
    }
}

fn snapshot_budget(body: &Value) -> BudgetRectifySnapshot {
    let max_tokens = body.get("max_tokens").and_then(|v| v.as_u64());
    let thinking = body.get("thinking").and_then(|t| t.as_object());
    let thinking_type = thinking
        .and_then(|t| t.get("type"))
        .and_then(|v| v.as_str())
        .map(ToString::to_string);
    let thinking_budget_tokens = thinking
        .and_then(|t| t.get("budget_tokens"))
        .and_then(|v| v.as_u64());
    BudgetRectifySnapshot {
        max_tokens,
        thinking_type,
        thinking_budget_tokens,
    }
}
```

## 三、集成到请求流程

### 工作流程

```
1. 发送 API 请求
   ↓
2. 收到错误响应
   ↓
3. 检查是否为 Anthropic 类型供应商（Claude/ClaudeAuth）
   ↓
4. 检查是否需要触发 Rectifier
   ├─→ should_rectify_thinking_signature()
   └─→ should_rectify_thinking_budget()
   ↓
5. 如果需要整流
   ├─→ 检查是否已经重试过（避免无限循环）
   ├─→ 应用整流算法修改请求体
   ├─→ 记录整流日志
   └─→ 重试请求（同一 provider，仅重试一次）
   ↓
6. 返回结果
```

### 真实集成代码示例（基于 CC-Switch）

```rust
pub struct RequestForwarder {
    router: Arc<ProviderRouter>,
    status: Arc<RwLock<ProxyStatus>>,
    rectifier_config: RectifierConfig,
    // ... 其他字段
}

impl RequestForwarder {
    pub async fn forward(
        &self,
        mut body: Value,
        app_type: AppType,
    ) -> Result<ForwardResult, ForwardError> {
        let app_type_str = app_type.to_string();

        // 重试标记
        let mut rectifier_retried = false;
        let mut budget_rectifier_retried = false;

        loop {
            // 发送请求到上游 Provider
            let result = self.send_to_provider(&body, app_type).await;

            match result {
                Ok(response) => {
                    // 请求成功，返回响应
                    return Ok(ForwardResult {
                        response,
                        provider: provider.clone(),
                    });
                }
                Err(e) => {
                    // 检测是否需要触发整流器（仅 Claude/ClaudeAuth 供应商）
                    let provider_type = ProviderType::from_app_type_and_config(app_type, &provider);
                    let is_anthropic_provider = matches!(
                        provider_type,
                        ProviderType::Claude | ProviderType::ClaudeAuth
                    );

                    let mut signature_rectifier_non_retryable_client_error = false;

                    // ======= Thinking Signature Rectifier =======
                    if is_anthropic_provider {
                        let error_message = extract_error_message(&e);

                        if should_rectify_thinking_signature(
                            error_message.as_deref(),
                            &self.rectifier_config,
                        ) {
                            // 已经重试过：直接返回错误（不可重试客户端错误）
                            if rectifier_retried {
                                log::warn!("[{app_type_str}] [RECT-005] 整流器已触发过，不再重试");

                                // 释放熔断器 permit（这是客户端兼容性问题，不记录为服务端错误）
                                self.router.release_permit_neutral(&provider.id, &app_type_str).await;

                                // 更新统计
                                let mut status = self.status.write().await;
                                status.failed_requests += 1;
                                status.last_error = Some(e.to_string());

                                return Err(ForwardError {
                                    error: e,
                                    provider: Some(provider.clone()),
                                });
                            }

                            // 首次触发：整流请求体
                            let rectified = rectify_anthropic_request(&mut body);

                            // 整流未生效：继续尝试 budget 整流路径
                            if !rectified.applied {
                                log::warn!(
                                    "[{app_type_str}] [RECT-006] thinking 签名整流器触发但无可整流内容，继续检查 budget"
                                );
                                signature_rectifier_non_retryable_client_error = true;
                            } else {
                                log::info!(
                                    "[{}] [RECT-001] thinking 签名整流器触发, 移除 {} thinking blocks, {} redacted_thinking blocks, {} signature fields",
                                    app_type_str,
                                    rectified.removed_thinking_blocks,
                                    rectified.removed_redacted_thinking_blocks,
                                    rectified.removed_signature_fields
                                );

                                // 标记已重试
                                rectifier_retried = true;

                                // 使用同一供应商重试（不计入熔断器）
                                log::info!("[{app_type_str}] [RECT-002] 使用整流后的请求体重试");

                                // 继续 loop，使用修改后的 body 重新发送请求
                                continue;
                            }
                        }
                    }

                    // ======= Thinking Budget Rectifier =======
                    if is_anthropic_provider {
                        let error_message = extract_error_message(&e);

                        if should_rectify_thinking_budget(
                            error_message.as_deref(),
                            &self.rectifier_config,
                        ) {
                            // 已经重试过：直接返回错误
                            if budget_rectifier_retried {
                                log::warn!(
                                    "[{app_type_str}] [RECT-013] budget 整流器已触发过，不再重试"
                                );

                                self.router.release_permit_neutral(&provider.id, &app_type_str).await;

                                let mut status = self.status.write().await;
                                status.failed_requests += 1;
                                status.last_error = Some(e.to_string());

                                return Err(ForwardError {
                                    error: e,
                                    provider: Some(provider.clone()),
                                });
                            }

                            // 首次触发：整流请求体
                            let budget_rectified = rectify_thinking_budget(&mut body);

                            if !budget_rectified.applied {
                                log::warn!(
                                    "[{app_type_str}] [RECT-014] budget 整流器触发但无可整流内容，不做无意义重试"
                                );

                                self.router.release_permit_neutral(&provider.id, &app_type_str).await;

                                let mut status = self.status.write().await;
                                status.failed_requests += 1;
                                status.last_error = Some(e.to_string());

                                return Err(ForwardError {
                                    error: e,
                                    provider: Some(provider.clone()),
                                });
                            }

                            log::info!(
                                "[{}] [RECT-009] budget 整流器触发, thinking.type: {:?} -> {:?}, budget_tokens: {:?} -> {:?}, max_tokens: {:?} -> {:?}",
                                app_type_str,
                                budget_rectified.before.thinking_type,
                                budget_rectified.after.thinking_type,
                                budget_rectified.before.thinking_budget_tokens,
                                budget_rectified.after.thinking_budget_tokens,
                                budget_rectified.before.max_tokens,
                                budget_rectified.after.max_tokens
                            );

                            // 标记已重试
                            budget_rectifier_retried = true;

                            log::info!("[{app_type_str}] [RECT-010] 使用整流后的请求体重试");

                            // 继续 loop，使用修改后的 body 重新发送请求
                            continue;
                        }
                    }

                    // 如果两个整流器都不适用，返回原始错误
                    if signature_rectifier_non_retryable_client_error {
                        // Signature 整流器触发但无法整流，且 Budget 整流器也不适用
                        log::warn!("[{app_type_str}] [RECT-007] 签名整流器误判或无法处理，budget 整流器也不适用，按客户端错误返回");
                    }

                    return Err(ForwardError {
                        error: e,
                        provider: Some(provider.clone()),
                    });
                }
            }
        }
    }
}

// 辅助函数：从错误中提取错误消息
fn extract_error_message(error: &ProxyError) -> Option<String> {
    match error {
        ProxyError::UpstreamError { message, .. } => Some(message.clone()),
        ProxyError::RequestFailed { source } => Some(source.to_string()),
        _ => None,
    }
}
```

### 关键实现要点

1. **仅对 Anthropic 类型供应商启用**
   - 检查 `ProviderType::Claude` 或 `ProviderType::ClaudeAuth`
   - 其他类型供应商跳过整流逻辑

2. **使用标志位防止无限循环**
   - `rectifier_retried`: Signature Rectifier 是否已重试
   - `budget_rectifier_retried`: Budget Rectifier 是否已重试
   - 每个整流器最多触发一次

3. **整流器按顺序检查**
   - 先检查 Thinking Signature Rectifier
   - 如果未触发或未生效，再检查 Thinking Budget Rectifier
   - 两者可能在同一次错误中都触发（罕见）

4. **整流无效时的处理**
   - 如果 `rectified.applied == false`，说明没有可整流的内容
   - 记录警告日志，继续检查下一个整流器
   - 如果所有整流器都不适用，返回原始错误

5. **不计入熔断器统计**
   - 整流失败被视为客户端兼容性问题，不是服务端故障
   - 使用 `release_permit_neutral()` 释放 permit，不增加熔断器失败计数

6. **使用原 Provider 重试**
   - 整流后使用同一个 Provider 重试，不切换到 Failover
   - 通过 `continue` 跳回 loop 开始，重新发送请求

## 四、前端配置界面

### React 组件示例

```typescript
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface RectifierConfig {
  enabled: boolean;
  requestThinkingSignature: boolean;
  requestThinkingBudget: boolean;
}

export function RectifierConfigPanel() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<RectifierConfig>({
    enabled: true,
    requestThinkingSignature: true,
    requestThinkingBudget: true,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    settingsApi
      .getRectifierConfig()
      .then(setConfig)
      .catch((e) => console.error("Failed to load rectifier config:", e))
      .finally(() => setIsLoading(false));
  }, []);

  const handleChange = async (updates: Partial<RectifierConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    try {
      await settingsApi.setRectifierConfig(newConfig);
    } catch (e) {
      console.error("Failed to save rectifier config:", e);
      toast.error(String(e));
      setConfig(config);
    }
  };

  if (isLoading) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>{t("settings.advanced.rectifier.enabled")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("settings.advanced.rectifier.enabledDescription")}
          </p>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={(checked) => handleChange({ enabled: checked })}
        />
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground">
          {t("settings.advanced.rectifier.requestGroup")}
        </h4>
        <div className="flex items-center justify-between pl-4">
          <div className="space-y-0.5">
            <Label>{t("settings.advanced.rectifier.thinkingSignature")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("settings.advanced.rectifier.thinkingSignatureDescription")}
            </p>
          </div>
          <Switch
            checked={config.requestThinkingSignature}
            disabled={!config.enabled}
            onCheckedChange={(checked) =>
              handleChange({ requestThinkingSignature: checked })
            }
          />
        </div>
        <div className="flex items-center justify-between pl-4">
          <div className="space-y-0.5">
            <Label>{t("settings.advanced.rectifier.thinkingBudget")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("settings.advanced.rectifier.thinkingBudgetDescription")}
            </p>
          </div>
          <Switch
            checked={config.requestThinkingBudget}
            disabled={!config.enabled}
            onCheckedChange={(checked) =>
              handleChange({ requestThinkingBudget: checked })
            }
          />
        </div>
      </div>
    </div>
  );
}
```

### 国际化文本

```json
{
  "settings": {
    "advanced": {
      "rectifier": {
        "title": "Rectifier",
        "description": "Automatically fix API request compatibility issues",
        "enabled": "Enable Rectifier",
        "enabledDescription": "Master switch, all rectification features will be disabled when turned off",
        "requestGroup": "Request Rectification",
        "thinkingSignature": "Thinking Signature Rectification",
        "thinkingSignatureDescription": "When an Anthropic-type provider returns thinking signature incompatibility or illegal request errors, automatically removes incompatible thinking-related blocks and retries once with the same provider",
        "thinkingBudget": "Thinking Budget Rectification",
        "thinkingBudgetDescription": "When an Anthropic-type provider returns budget_tokens constraint errors (such as at least 1024), automatically normalizes thinking to enabled, sets thinking budget to 32000, and raises max_tokens to 64000 if needed, then retries once"
      }
    }
  }
}
```

## 五、测试用例参考

### Thinking Signature Rectifier 测试

```rust
#[test]
fn test_detect_invalid_signature() {
    assert!(should_rectify_thinking_signature(
        Some("messages.1.content.0: Invalid `signature` in `thinking` block"),
        &enabled_config()
    ));
}

#[test]
fn test_rectify_removes_thinking_blocks() {
    let mut body = json!({
        "model": "claude-test",
        "messages": [{
            "role": "assistant",
            "content": [
                { "type": "thinking", "thinking": "t", "signature": "sig" },
                { "type": "text", "text": "hello", "signature": "sig_text" },
                { "type": "tool_use", "id": "toolu_1", "name": "WebSearch", "input": {}, "signature": "sig_tool" }
            ]
        }]
    });

    let result = rectify_anthropic_request(&mut body);

    assert!(result.applied);
    assert_eq!(result.removed_thinking_blocks, 1);
    assert_eq!(result.removed_signature_fields, 2);

    let content = body["messages"][0]["content"].as_array().unwrap();
    assert_eq!(content.len(), 2);
    assert_eq!(content[0]["type"], "text");
    assert!(content[0].get("signature").is_none());
}

#[test]
fn test_rectify_removes_top_level_thinking() {
    let mut body = json!({
        "model": "claude-test",
        "thinking": { "type": "enabled", "budget_tokens": 1024 },
        "messages": [{
            "role": "assistant",
            "content": [
                { "type": "tool_use", "id": "toolu_1", "name": "WebSearch", "input": {} }
            ]
        }]
    });

    let result = rectify_anthropic_request(&mut body);

    assert!(result.applied);
    assert!(body.get("thinking").is_none());
}
```

### Thinking Budget Rectifier 测试

```rust
#[test]
fn test_detect_budget_tokens_thinking_error() {
    assert!(should_rectify_thinking_budget(
        Some("thinking.budget_tokens: Input should be greater than or equal to 1024"),
        &enabled_config()
    ));
}

#[test]
fn test_rectify_budget_basic() {
    let mut body = json!({
        "model": "claude-test",
        "thinking": { "type": "enabled", "budget_tokens": 512 },
        "max_tokens": 1024
    });

    let result = rectify_thinking_budget(&mut body);

    assert!(result.applied);
    assert_eq!(result.after.thinking_budget_tokens, Some(32000));
    assert_eq!(result.after.max_tokens, Some(64000));
    assert_eq!(body["thinking"]["type"], "enabled");
    assert_eq!(body["thinking"]["budget_tokens"], 32000);
    assert_eq!(body["max_tokens"], 64000);
}

#[test]
fn test_rectify_budget_skips_adaptive() {
    let mut body = json!({
        "model": "claude-test",
        "thinking": { "type": "adaptive", "budget_tokens": 512 },
        "max_tokens": 1024
    });

    let result = rectify_thinking_budget(&mut body);

    assert!(!result.applied);
    assert_eq!(body["thinking"]["type"], "adaptive");
    assert_eq!(body["thinking"]["budget_tokens"], 512);
}
```

## 六、关键注意事项

### 1. 仅重试一次

整流后的请求**只重试一次**，避免无限循环。如果重试后仍失败，将错误返回给用户。

### 2. adaptive 模式特殊处理

`thinking.type = "adaptive"` 时，Budget Rectifier 不做任何修改，保持原样。

### 3. 错误检测使用小写匹配

所有错误消息检测都转为小写后匹配，提高容错性。

### 4. 日志记录

建议在整流前后记录详细日志，包括：
- 触发的整流类型
- 修改的具体字段
- 修改前后的值对比

### 5. 配置持久化

配置项需要持久化存储，支持用户自定义开关。

### 6. 向后兼容

即使 Anthropic API 未来修改格式，该系统也应能优雅降级，不影响正常请求。

## 七、实现优先级

### P0 - 核心功能
1. Thinking Signature Rectifier 基础实现
2. 错误检测规则（场景 1-3）
3. 整流算法（清理 thinking blocks 和 signature 字段）
4. 配置管理和持久化

### P1 - 完善功能
1. Thinking Budget Rectifier 实现
2. 错误检测规则（场景 4-7）
3. 顶层 thinking 字段处理
4. 前端配置界面

### P2 - 增强体验
1. 详细日志记录
2. 整流统计和监控
3. 测试用例覆盖
4. 文档和示例

## 八、参考资源

- **源码仓库**: https://github.com/farion1231/cc-switch
- **核心文件**:
  - `src-tauri/src/proxy/thinking_rectifier.rs`
  - `src-tauri/src/proxy/thinking_budget_rectifier.rs`
  - `src-tauri/src/proxy/types.rs`
  - `src/components/settings/RectifierConfigPanel.tsx`
- **Release Note**: docs/release-note-v3.10.0-en.md

## 九、配置持久化实现

### 数据库层（Rust Tauri）

```rust
// 1. 在 proxy/types.rs 中定义配置结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RectifierConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub request_thinking_signature: bool,
    #[serde(default = "default_true")]
    pub request_thinking_budget: bool,
}

fn default_true() -> bool { true }

impl Default for RectifierConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            request_thinking_signature: true,
            request_thinking_budget: true,
        }
    }
}

// 2. 在 database/dao/settings.rs 中添加持久化方法
impl Database {
    /// 获取整流器配置
    /// 返回整流器配置，如果不存在则返回默认值（全部开启）
    pub fn get_rectifier_config(&self) -> Result<RectifierConfig, AppError> {
        match self.get_setting("rectifier_config")? {
            Some(json) => serde_json::from_str(&json)
                .map_err(|e| AppError::Database(format!("解析整流器配置失败: {e}"))),
            None => Ok(RectifierConfig::default()),
        }
    }

    /// 更新整流器配置
    pub fn set_rectifier_config(&self, config: &RectifierConfig) -> Result<(), AppError> {
        let json = serde_json::to_string(config)
            .map_err(|e| AppError::Database(format!("序列化整流器配置失败: {e}"))?;
        self.set_setting("rectifier_config", &json)
    }
}

// 3. 在 commands/settings.rs 中添加 Tauri 命令
#[tauri::command]
pub async fn get_rectifier_config(
    state: tauri::State<'_, crate::AppState>,
) -> Result<RectifierConfig, String> {
    state.db.get_rectifier_config().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_rectifier_config(
    state: tauri::State<'_, crate::AppState>,
    config: RectifierConfig,
) -> Result<bool, String> {
    state.db.set_rectifier_config(&config).map_err(|e| e.to_string())?;
    Ok(true)
}

// 4. 在 lib.rs 中注册命令
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        get_rectifier_config,
        set_rectifier_config,
        // ... 其他命令
    ])
```

### API 层（TypeScript/React）

```typescript
// lib/api/settings.ts
export interface RectifierConfig {
  enabled: boolean;
  requestThinkingSignature: boolean;
  requestThinkingBudget: boolean;
}

export const settingsApi = {
  async getRectifierConfig(): Promise<RectifierConfig> {
    return invoke<RectifierConfig>("get_rectifier_config");
  },

  async setRectifierConfig(config: RectifierConfig): Promise<void> {
    await invoke("set_rectifier_config", { config });
  },
};
```

### 初始化时加载配置

```rust
// proxy/handler_context.rs
pub async fn create_handler_context(
    state: &AppState,
) -> Result<HandlerContext, AppError> {
    // 加载整流器配置
    let rectifier_config = state.db.get_rectifier_config().unwrap_or_default();

    Ok(HandlerContext {
        // ... 其他字段
        rectifier_config,
    })
}
```

## 十、集成检查清单

### 后端（Rust）

- [ ] 创建配置类型定义 (`RectifierConfig`)
- [ ] 实现 `default_true()` 辅助函数
- [ ] 实现 Thinking Signature 错误检测 (`should_rectify_thinking_signature`)
- [ ] 实现 Thinking Signature 整流算法 (`rectify_anthropic_request`)
- [ ] 实现 Thinking Budget 错误检测 (`should_rectify_thinking_budget`)
- [ ] 实现 Thinking Budget 整流算法 (`rectify_thinking_budget`)
- [ ] 在 `RequestForwarder` 中集成整流逻辑
- [ ] 添加重试标记防止无限循环
- [ ] 添加整流器日志（RECT-001 ~ RECT-014）
- [ ] 实现数据库持久化方法 (`get_rectifier_config`, `set_rectifier_config`)
- [ ] 实现 Tauri 命令暴露给前端
- [ ] 在 handler context 初始化时加载配置
- [ ] 编写单元测试（错误检测 + 整流算法）

### 前端（TypeScript/React）

- [ ] 定义 TypeScript 配置接口
- [ ] 实现 API 方法 (`getRectifierConfig`, `setRectifierConfig`)
- [ ] 实现配置面板组件 (`RectifierConfigPanel`)
- [ ] 使用 `useEffect` 加载配置
- [ ] 实现配置变更保存逻辑
- [ ] 添加错误处理（`toast` 提示）
- [ ] 添加开关禁用状态（依赖总开关）

### 国际化

- [ ] 添加英文翻译 (`en.json`)
- [ ] 添加中文翻译 (`zh.json`)
- [ ] 添加日文翻译 (`ja.json`)

### 测试

- [ ] 错误检测单元测试（覆盖所有 7 种场景）
- [ ] 整流算法单元测试
- [ ] 配置序列化/反序列化测试
- [ ] 集成测试（模拟 API 错误 + 整流重试）
- [ ] 前端组件测试

### 文档

- [ ] 添加架构文档
- [ ] 添加使用说明
- [ ] 添加故障排查指南
- [ ] 更新 CHANGELOG

### 部署验证

- [ ] 本地开发环境测试
- [ ] 与真实第三方 API 网关测试
- [ ] 生产环境灰度发布
- [ ] 监控整流触发频率

---

## 附录 A：日志代码参考

CC-Switch 使用统一的日志代码格式 `[RECT-XXX]`，便于搜索和监控：

### Thinking Signature Rectifier 日志

| 代码 | 级别 | 描述 |
|------|------|------|
| RECT-001 | INFO | 签名整流器触发，记录移除的 blocks 数量 |
| RECT-002 | INFO | 使用整流后的请求体重试 |
| RECT-003 | ERROR | 整流后重试仍失败 |
| RECT-004 | INFO | 整流后重试成功 |
| RECT-005 | WARN | 整流器已触发过，不再重试 |
| RECT-006 | WARN | 签名整流器触发但无可整流内容，继续检查 budget |
| RECT-007 | WARN | 签名整流器误判或无法处理，budget 整流器也不适用 |
| RECT-008 | ERROR | 整流过程中发生内部错误 |

### Thinking Budget Rectifier 日志

| 代码 | 级别 | 描述 |
|------|------|------|
| RECT-009 | INFO | Budget 整流器触发，记录参数变化 |
| RECT-010 | INFO | 使用整流后的请求体重试 |
| RECT-011 | ERROR | Budget 整流后重试仍失败 |
| RECT-012 | INFO | Budget 整流后重试成功 |
| RECT-013 | WARN | Budget 整流器已触发过，不再重试 |
| RECT-014 | WARN | Budget 整流器触发但无可整流内容 |

### 日志格式示例

```
[Claude] [RECT-001] thinking 签名整流器触发, 移除 1 thinking blocks, 0 redacted_thinking blocks, 2 signature fields
[Claude] [RECT-002] 使用整流后的请求体重试
[Claude] [RECT-004] 整流后重试成功
```

## 附录 B：监控指标建议

### Prometheus Metrics（可选）

```rust
// 整流器触发计数
RECTIFIER_TRIGGERS_TOTAL{
    type="signature|budget",  // 整流器类型
    provider="provider_id",   // 供应商 ID
    result="success|failure"  // 结果
} counter

// 整流器处理延迟
RECTIFIER_PROCESSING_DURATION_SECONDS{
    type="signature|budget"
} histogram

// 整流器移除的 blocks 统计
RECTIFIER_BLOCKS_REMOVED_TOTAL{
    type="thinking|redacted_thinking|signature"
} counter
```

### 业务监控指标

| 指标 | 说明 | 告警阈值建议 |
|------|------|-------------|
| 整流器触发频率 | 每分钟触发次数 | > 100/min 时关注 |
| 整流成功率 | 整流后重试成功比例 | < 80% 时告警 |
| 整流器误判率 | 触发但无可整流内容的比例 | > 20% 时优化检测规则 |
| 供应商触发分布 | 各供应商触发次数分布 | 识别问题供应商 |

## 附录 C：故障排查指南

### 问题 1：整流器未触发

**现象**：API 返回兼容错误，但整流器未触发

**排查步骤**：
1. 检查 `RectifierConfig.enabled` 是否为 `true`
2. 检查对应子开关是否开启（`request_thinking_signature` 或 `request_thinking_budget`）
3. 检查错误消息是否匹配检测规则（大小写不敏感）
4. 检查日志中是否有 `[RECT-XXX]` 相关输出

### 问题 2：整流器误判

**现象**：整流器触发但无可整流内容，或整流后仍失败

**排查步骤**：
1. 检查日志 `[RECT-006]` 或 `[RECT-014]`
2. 确认错误消息格式，是否包含 `tool_use` 等关键字
3. 调整检测规则，添加更严格的匹配条件

### 问题 3：整流后无限循环

**现象**：同一个请求不断重试

**排查步骤**：
1. 检查是否设置了 `rectifier_retried` 标志位
2. 检查标志位是否在整流后正确更新
3. 检查 loop 是否正确使用 `continue` 或 `break`

### 问题 4：配置不生效

**现象**：修改配置后整流器行为未改变

**排查步骤**：
1. 检查配置是否正确保存到数据库
2. 检查 `RequestForwarder` 是否使用最新的 `rectifier_config`
3. 重启服务（如果配置是启动时加载的）

## 附录 D：参考源码位置

```
cc-switch/
├── src-tauri/src/
│   ├── proxy/
│   │   ├── types.rs              # RectifierConfig 定义
│   │   ├── thinking_rectifier.rs # Thinking Signature 整流器
│   │   ├── thinking_budget_rectifier.rs # Thinking Budget 整流器
│   │   ├── forwarder.rs          # 请求转发器（集成整流逻辑）
│   │   └── handler_context.rs    # Handler 上下文（加载配置）
│   ├── database/dao/settings.rs  # 配置持久化
│   └── commands/settings.rs      # Tauri 命令
├── src/
│   ├── components/settings/
│   │   └── RectifierConfigPanel.tsx  # 前端配置面板
│   └── lib/api/settings.ts       # API 层
└── src/i18n/locales/
    ├── en.json                   # 英文翻译
    ├── zh.json                   # 中文翻译
    └── ja.json                   # 日文翻译
```
