# 时间选择器组件

时间选择器组件是用于提供时间选项的交互组件。本文档介绍时间选择器组件的 JSON 结构和相关属性。
**注意事项**：本文档介绍时间选择器组件的 JSON 2.0 结构，要查看历史 JSON 1.0 结构，参考[时间选择器](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-components/interactive-components/time-selector)。
![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/06e975e8c8296319e6c3ed1dc4f9d3a5_F8K0yHFkdG.png?height=188&lazyload=true&maxWidth=400&width=560)

## 注意事项

在使用时间选择器时，你需提醒用户与当前选择时间场景相对应的时区信息。例如，在预定海外酒店的场景下，一般使用酒店所在地时区；设置日程场景下，一般使用用户当前所在地的时区。开放平台会返回用户当前的时区作为参考，但并不代表用户选择了该时区。

## 嵌套规则

- 时间选择器组件支持嵌套在分栏、表单容器、折叠面板、循环容器、交互容器中使用。
- 在卡片搭建工具中，时间选择器组件暂不支持嵌套在交互容器中。

## 组件属性

### JSON 结构

时间选择器组件的完整 JSON 2.0 结构如下所示：
```json
{
    "schema": "2.0",
    "body": {
        "elements": [
            {
                "tag": "picker_time", // 时间选择器组件的标签。
                "element_id": "custom_id", // 操作组件的唯一标识。用于在调用组件相关接口中指定组件。需开发者自定义。
                "margin": "0px 0px 0px 0px", // 组件的外边距，默认值 "0"，支持范围 [-99,99]px。
                "name": "picker_time1", // 时间选择器组件的唯一标识。当组件内嵌在表单容器中时，该字段必填。
                "required": false, // 时间是否必选。默认值 false。
                "disabled": false, // 是否禁用该时间选择器组件。默认值 false。
                "width": "default", // 时间选择器的宽度。
                "behaviors": [
                    { // 为组件配置回传交互。
                        "type": "callback",
                        "value": {
                            // 回传交互数据。支持 object 数据类型。开放平台 SDK 仅支持 object 类型的回传交互数据。
                            "key_1": "value_1"
                        }
                    }
                ],
                "initial_time": "11:30", // 时间初始值。
                "placeholder": {
                    // 时间选择器组件内的占位文本。
                    "tag": "plain_text",
                    "content": "请选择"
                },
                "value": {
                    // 回传数据
                    "key_1": "value_1"
                },
                "confirm": {
                    // 二次确认弹窗配置
                    "title": {
                        "tag": "plain_text",
                        "content": "title"
                    },
                    "text": {
                        "tag": "plain_text",
                        "content": "content"
                    }
                }
            }
        ]
    }
}
```

### 字段说明

时间选择器组件的字段说明如下表。

名称 | 必填 | 类型 | 默认值 | 说明
---|---|---|---|---
tag | 是 | string | / | 组件的标签。时间选择器组件取固定值 `picker_time`。
element_id | 否 | String | 空 | 操作组件的唯一标识。JSON 2.0 新增属性。用于在调用[组件相关接口](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card-element/create)中指定组件。在同一张卡片内，该字段的值全局唯一。仅允许使用字母、数字和下划线，必须以字母开头，不得超过 20 字符。
margin | 否 | String | 0 | 组件的外边距。JSON 2.0 新增属性。值的取值范围为 [-99,99]px。可选值：<br>- 单值，如 "10px"，表示组件的四个外边距都为 10 px。<br>- 双值，如 "4px 0"，表示组件的上下外边距为 4 px，左右外边距为 0 px。使用空格间隔（边距为 0 时可不加单位）。<br>- 多值，如 "4px 0 4px 0"，表示组件的上、右、下、左的外边距分别为 4px，12px，4px，12px。使用空格间隔。
name | 否 | String | 空 | 该时间选择器组件的唯一标识。用于识别用户提交的数据属于哪个组件。<br>**注意**: 当时间选择器组件嵌套在表单容器中时，该字段必填且需在卡片全局内唯一。
required | 否 | Boolean | false | 时间否必选。当组件内嵌在表单容器中时，该属性可用。其它情况将报错或不生效。可取值：<br>- true：时间必选。当用户点击表单容器的“提交”时，未填写时间，则前端提示“有必填项未填写”，不会向开发者的服务端发起回传请求。<br>- false：时间选填。当用户点击表单容器的“提交”时，未填写时间，仍提交表单容器中的数据。
disabled | 否 | Boolean | false | 是否禁用该时间选择器。该属性仅支持飞书 V7.4 及以上版本的客户端。可选值：<br>- true：禁用时间选择器组件<br>- false：时间选择器组件保持可用状态
initial_time | 否 | String | 空 | 时间选择器组件的初始选项值。格式为 `HH:mm`。该配置将会覆盖 `placeholder` 配置的占位文本。
placeholder | 否 | object | / | 时间选择器组件内的占位文本。<br>**注意**：<br>- 未配置 `initial_time` 字段设置初始选项值时，该字段必填。<br>- 配置 `initial_time` 字段设置初始选项值后，该字段不再生效。
└ tag | 是 | String | plain_text | 占位提示标签。固定值为 plain_text。
└ content | 否 | String | / | 占位文本的内容，最多支持 100 个字符。
value | 是 | JSON | / | 设置交互的回传数据，当用户点击交互组件的选项后，会将 value 的值返回给接收回调数据的服务器。后续你可以通过服务器接收的 value 值进行业务处理。<br>该字段值仅支持 key-value 形式的 JSON 结构，且 key 为 String 类型。示例值：<br>```json<br>"value":{<br>"key-1":Object-1,<br>"key-2":Object-2,<br>"key-3":Object-3,<br>······<br>}<br>```
width | 否 | String | default | 时间选择器组件的宽度。支持以下枚举值：<br>- default：默认宽度<br>- fill：卡片最大支持宽度<br>- [100,∞)px：自定义宽度。超出卡片宽度时将按最大支持宽度展示
behaviors | 是 | Struct | / | 配置交互类型和具体交互行为。详情参考[配置卡片交互](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/configuring-card-interactions)中 behaviors 的字段说明。
confirm | 否 | Struct | 默认不生效此属性。 | 二次确认弹窗配置。指在用户提交时弹出二次确认弹窗提示；只有用户点击确认后，才提交输入的内容。该字段默认提供了确认和取消按钮，你只需要配置弹窗的标题与内容即可。<br>**注意**：<code>confirm</code> 字段仅在用户点击包含提交属性的按钮时才会触发二次确认弹窗。
└ title | 是 | Struct | / | 二次确认弹窗标题。
└ └ tag | 是 | String | plain_text | 二次确认弹窗标题文本的标签。固定取值为 `plain_text`。
└ └ content | 是 | String | / | 二次确认弹窗标题的内容。
└ text | 是 | Struct | / | 二次确认弹窗的文本内容。
└ └ tag | 是 | String | plain_text | 二次确认弹窗文本的标签。固定取值为 `plain_text`。
└ └ content | 是 | String | / | 二次确认弹窗文本的具体内容。

## 回调示例

时间选择器默认拥有交互能力。用户基于时间选择器进行交互时，你在开发者后台配置的请求地址将会收到回调数据。

- 如果你添加的是新版卡片回传交互回调(`card.action.trigger`)，卡片将默认将回传如下所示的交互事件。详情参考[卡片回传交互回调](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-callback-communication)。

- 如果你添加的是旧版卡片回传交互回调(`card.action.trigger_v1`)，可参考[消息卡片回传交互（旧）](https://open.feishu.cn/document/ukTMukTMukTM/uYzM3QjL2MzN04iNzcDN/configuring-card-callbacks/card-callback-structure)了解回调结构。

新版卡片回传交互(`card.action.trigger`)时间选择器回调示例

```json
{
    "schema": "2.0", // 回调的版本
    "header": { // 回调基本信息
        "event_id": "f7984f25108f8137722bb63c*****", // 回调的唯一标识
        "token": "066zT6pS4QCbgj5Do145GfDbbag*****", // 应用的 Verification Token
        "create_time": "1603977298000000", // 	回调发送的时间，接近回调发生的时间
        "event_type": "card.action.trigger", // 回调类型卡片交互场景中，固定为 "card.action.trigger"
        "tenant_key": "2df73991750*****", // 应用归属的 tenant key，即租户唯一标识
        "app_id": "cli_a5fb0ae6a4******" // 应用的 App ID
    },
    "event": { // 回调的详细信息
        "operator": { // 回调触发者信息
            "tenant_key": "2df73991750*****", // 回调触发者的 tenant key，即租户唯一标识
            "user_id": "867*****", // 回调触发者的 user ID。当应用开启“获取用户 user ID”权限后，该参数返回
            "open_id": "ou_3c14f3a59eaf2825dbe25359f15*****", // 	回调触发者的 Open ID
            "union_id": "on_cad4860e7af114fb4ff6c5d496d*****" // 回调触发者的 Union ID
        },
        "token": "c-295ee57216a5dc9de90fefd0aadb4b1d7d******", // 更新卡片用的凭证，有效期为 30 分钟，最多可更新 2 次
        "action": { // 用户选择时间后回传的数据
            "tag": "picker_time", // 时间选择器组件标签
            "timezone": "Asia/Shanghai", // 用户当前所在地区的时区
            "option": "05:05 +0800" // 用户选择的时间
        }
    },
    "host": "im_message", // 卡片展示场景
    "context": { //  卡片展示场景相关信息
        "open_message_id": "om_574d639e4a44e4dd646eaf628e2*****", // 卡片所在的消息 ID
        "open_chat_id": "oc_e4d2605ca917e695f54f11aaf56*****" // 卡片所在的会话 ID
    }
}
```
## 示例代码

以下 JSON 2.0 结构的示例代码可实现如下图所示的卡片效果：

![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/06e975e8c8296319e6c3ed1dc4f9d3a5_9wvv0E6mVS.png?height=188&lazyload=true&maxWidth=400&width=560)

```json
{
    "schema": "2.0",
    "body": {
        "elements": [
            {
                "tag": "picker_time",
                "placeholder": {
                    "tag": "plain_text",
                    "content": "请选择"
                },
                "width": "default",
                "initial_time": "09:00"
            },
            {
                "tag": "picker_time",
                "placeholder": {
                    "tag": "plain_text",
                    "content": "请选择"
                },
                "width": "default"
            }
        ]
    }
}
```
