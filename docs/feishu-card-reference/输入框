# 输入框组件

在使用卡片进行内容收集的场景下，你可能需要同时获取用户的主观内容，如原因、评价、备注等。在这种情况下，你可以使用输入框组件，实现简单的文本内容收集的场景。
**注意事项**：- 本文档介绍输入框组件的 JSON 2.0 结构，要查看历史 JSON 1.0 结构，参考[输入框](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-components/interactive-components/input)。

-  要结合使用输入框组件与[按钮](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/interactive-components/button)组件，你需将输入框组件与按钮组件内嵌于[表单容器](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/containers/form-container)中。

![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/5678dab3ae875312a7b55b18067790ca_EUyzl1K2LS.png?height=565&lazyload=true&maxWidth=300&width=696)

## 嵌套规则

输入框组件支持嵌套在分栏、表单容器、折叠面板、循环容器、交互容器中使用。在表单容器中，输入框组件的数据为异步提交的形式，即用户填写完所有表单项后，点击表单容器中绑定提交事件的按钮，才会将包括输入框组件的所有数据一次回调至开发者的服务端。

## 组件属性

### JSON 结构

输入框组件的完整 JSON 2.0 结构如下所示：
```json
{
  "schema": "2.0", // 卡片 JSON 结构的版本。默认为 1.0。要使用 JSON 2.0 结构，必须显示声明 2.0。
  "body": {
    "elements": [
      {
        "tag": "input", // 输入框的标签。
        "element_id": "custom_id", // 操作组件的唯一标识。JSON 2.0 新增属性。用于在调用组件相关接口中指定组件。需开发者自定义。
        "margin": "0px 0px 0px 0px", // 组件的外边距。JSON 2.0 新增属性。默认值 "0"，支持范围 [-99,99]px。
        "name": "input1", // 输入框的唯一标识。当输入框内嵌在表单容器时，该属性生效，用于识别用户提交的文本属于哪个输入框。
        "required": false, // 输入框的内容是否必填。当输入框内嵌在表单容器时，该属性可用。其它情况将报错或不生效。
        "placeholder": {
          // 输入框中的占位文本。
          "tag": "plain_text",
          "content": "请输入"
        },
        "default_value": "demo", // 输入框中为用户预填写的内容。
        "disabled": false, // 是否禁用该输入框组件。默认值 false。
        "disabled_tips": { // 指禁用组件后，用户将光标悬浮在整个组件上时展示的禁用提示文案。
          "tag": "plain_text",
          "content": "用户禁用提示文案"
        },
        "width": "default", // 输入框的宽度。
        "behaviors": [
          { // 为组件配置自定义的回传交互参数。
            "type": "callback",
            "value": {
              // 回传交互数据。支持 object 数据类型。开放平台 SDK 仅支持 object 类型的回传交互数据。
              "key_1": "value_1"
            }
          }
        ],
        "max_length": 5, // 输入框可容纳的最大文本长度。默认值 1000。
        "input_type": "multiline_text", //指定输入框的输入类型。默认为 text，即文本类型。
        "rows": 1, // 当输入类型为多行文本时，输入框的默认展示行数。
        "auto_resize": true, // 当输入类型为多行文本时，输入框高度是否自适应文本高度。仅在 PC 端生效。
        "max_rows": 5, // 输入框的最大展示行数。仅当 `auto_resize` 为 true 时有效。
        "show_icon": false, // 当输入类型为密码类型时，是否展示前缀图标。                    
        "label": {
          // 文本标签，即对输入框的描述，用于提示用户要填写的内容。
          "tag": "plain_text",
          "content": "请输入文本："
        },
        "label_position": "left", // 文本标签的位置。默认值 top。
        "value": {
          // 回传数据，支持 string 或 object 数据类型。历史属性。
          "k": "v"
        },
        "confirm": {
          // 二次确认弹窗配置。
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

输入框组件各字段说明如下表所示：

名称 | 必填 | 类型 | 默认值 | 说明
---|---|---|---|---
tag | 是 | String | 空 | 输入框的标签。固定值为 `input`。
element_id | 否 | String | 空 | 操作组件的唯一标识。JSON 2.0 新增属性。用于在调用[组件相关接口](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card-element/create)中指定组件。在同一张卡片内，该字段的值全局唯一。仅允许使用字母、数字和下划线，必须以字母开头，不得超过 20 字符。
margin | 否 | String | 0 | 组件的外边距。JSON 2.0 新增属性。值的取值范围为 [-99,99]px。可选值：<br>- 单值，如 "10px"，表示组件的四个外边距都为 10 px。<br>- 双值，如 "4px 0"，表示组件的上下外边距为 4 px，左右外边距为 0 px。使用空格间隔（边距为 0 时可不加单位）。<br>- 多值，如 "4px 0 4px 0"，表示组件的上、右、下、左的外边距分别为 4px，12px，4px，12px。使用空格间隔。
name | 否 | String | 空 | 输入框的唯一标识。当输入框内嵌在表单容器时，该属性生效，用于识别用户提交的文本属于哪个输入框。<br>**注意**：当输入框组件嵌套在表单容器中时，该字段必填且需在卡片全局内唯一。
required | 否 | Boolean | false | 输入框的内容是否必填。当输入框内嵌在表单容器时，该属性可用。其它情况将报错或不生效。可取值：<br>- true：输入框必填。当用户点击表单容器的“提交”时，未填写输入框，则前端提示“有必填项未填写”，不会向开发者的服务端发起回传请求。<br>- false：输入框选填。当用户点击表单容器的“提交”时，未填写输入框，仍提交表单容器中的数据。
disabled | 否 | Boolean | false | 是否禁用该输入框。该属性仅支持飞书 V7.4 及以上版本的客户端。可选值：<br>- true：禁用输入框组件<br>- false：输入框组件保持可用状态
disabled_tips | 否 | Object | 空 | 禁用整个组件后，用户将光标悬浮在整个组件上时展示的禁用提示文案。
└ tag | 否 | String | plain_text | 禁用提示文本的标签。固定值为 plain_text。
└ content | 否 | String | 请输入 | 禁用提示文本的内容。
placeholder | 否 | text 结构体 | / | 输入框中的占位文本。
└ tag | 否 | String | plain_text | 占位文本的标签。固定值为 plain_text。
└ content | 否 | String | 请输入 | 占位文本的内容，最多支持 100 个字符。例如：“请输入内容”。
default_value | 否 | String | 默认不生效此属性。 | 输入框中为用户预填写的内容。展示为用户在输入框中输入文本后待提交的样式。
width | 否 | String | default | 输入框的宽度。支持以下枚举值：<br>- default：默认宽度<br>- fill：卡片最大支持宽度<br>- [100,∞)px：自定义宽度。超出卡片宽度时将按最大支持宽度展示
behaviors | 否 | Struct | / | 配置交互类型和具体交互行为。详情参考[配置卡片交互](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/configuring-card-interactions)中 behaviors 的字段说明。
max_length | 否 | Number | 1,000 | 输入框可容纳的最大文本长度，可取 1~1,000 范围内的整数。当用户输入的文本字符数超过最大文本长度，组件将报错提示。
input_type | 否 | String | text | 指定输入框的输入类型。默认为 text，即文本类型。支持以下枚举值：<br>- text：普通文本<br>- multiline_text：多行文本，即可输入包含换行符的多行文本内容。换行符在回调中以 `\n` 返回<br>- password：密码。用户输入的文本内容将以“•”显示<br>**注意**：卡片搭建工具上暂不支持 `input_type` 属性。
show_icon | 否 | Boolean | true | 当输入类型为密码类型时，是否展示如下所示的前缀图标。仅当 `input_type` 为 password 时有效。<br>![image.png](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/3cb2d826d9e86ce6e260b0e78c23c830_wWBdvVSdSu.png?height=74&lazyload=true&width=450)
rows | 否 | Number | 5 | 当输入类型为多行文本时，输入框的默认展示行数。仅当 `input_type` 为 multiline_text 时有效。
auto_resize | 否 | Boolean | false | 当输入类型为多行文本时，输入框高度是否自适应文本高度。仅在 PC 端生效。仅当 `input_type` 为 multiline_text 时有效。可选值：<br>- `true`：输入框高度自适应输入框内的文本高度<br>- `false`：输入框高度固定为 `rows` 属性指定的高度，不随输入框中的内容变化而变化。
max_rows | 否 | Number | 空 | 输入框的最大展示行数。仅当 `auto_resize` 为 true 时有效。<br>注意：<br>- 取值为大于等于 1 的整数。否则，小于 1 则自动取 1，不为整数则四舍五入取整。<br>- 取值为空时不限制输入框的最大文本展示高度（默认值），但前端渲染时，输入框可展示的最大高度不超过 x 行。
label | 否 | text 结构体 | 默认不生效此属性。 | 文本标签，即对输入框的描述，用于提示用户要填写的内容。多用于表单容器中内嵌的输入框组件。
└ tag | 否 | String | plain_text | 输入框描述的标签。固定取值为 plain_text。
└ content | 否 | String | / | 描述的内容。
label_position | 否 | String | top | 文本标签的位置。可取值：<br>- top：文本标签位于输入框上方<br>- left：文本标签位于输入框左边<br>**注意**：<br>在移动端等窄屏幕场景下，文本标签将自适应固定展示在输入框上方。
value | 否 | String 或 Object | 空 | 历史属性。你可在交互事件中自定义回传数据，支持 string 或 object 数据类型。
confirm | 否 | Struct | 默认不生效此属性。 | 二次确认弹窗配置。指在用户提交时弹出二次确认弹窗提示；只有用户点击确认后，才提交输入的内容。该字段默认提供了确认和取消按钮，你只需要配置弹窗的标题与内容即可。<br>**注意**：confirm 字段仅在用户点击包含提交属性的按钮时才会触发二次确认弹窗。
└ title | 是 | Struct | / | 二次确认弹窗标题。
└ └ tag | 是 | String | plain_text | 二次确认弹窗标题文本的标签。固定取值为 plain_text。
└ └ content | 是 | String | / | 二次确认弹窗标题的内容。
└ text | 是 | Struct | / | 二次确认弹窗标题的内容。
└ └ tag | 是 | String | plain_text | 二次确认弹窗文本的标签。固定取值为 plain_text。
└ └ content | 是 | String | / | 二次确认弹窗文本的具体内容。

## 回调示例

输入框组件默认拥有交互能力。用户点击输入框中的提交图标后，你在开发者后台配置的请求地址将会收到回调数据。

- 如果你添加的是新版卡片回传交互回调(`card.action.trigger`)，卡片将默认将回传如下所示的交互事件。详情参考[卡片回传交互回调](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-callback-communication)。

- 如果你添加的是旧版卡片回传交互回调(`card.action.trigger_v1`)，可参考[消息卡片回传交互（旧）](https://open.feishu.cn/document/ukTMukTMukTM/uYzM3QjL2MzN04iNzcDN/configuring-card-callbacks/card-callback-structure)了解回调结构。

新版卡片回传交互(`card.action.trigger`)输入框回调示例：

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
        "operator": { // 	回调触发者信息
            "tenant_key": "2df73991750*****", // 回调触发者的 tenant key，即租户唯一标识
            "user_id": "867*****", // 回调触发者的 user ID。当应用开启“获取用户 user ID”权限后，该参数返回
            "open_id": "ou_3c14f3a59eaf2825dbe25359f15*****", // 	回调触发者的 Open ID
            "union_id": "on_cad4860e7af114fb4ff6c5d496d*****" // 回调触发者的 Union ID
        },
        "token": "c-295ee57216a5dc9de90fefd0aadb4b1d7d******", // 更新卡片用的凭证，有效期为 30 分钟，最多可更新 2 次
        "action": { // 用户操作交互组件回传的数据
            "tag": "input", // 输入框组件的标签
            "input_value": "Zhang Min", // 输入框中用户提交的数据
            "value": { // 如果输入框配置了 behaviors 参数，则在此处返回自定义的回传交互参数
                "key_1": "value_1"
            }
        },
        "host": "im_message", // 卡片展示场景
        "context": { //  卡片展示场景相关信息
            "open_message_id": "om_574d639e4a44e4dd646eaf628e2*****", // 卡片所在的消息 ID
            "open_chat_id": "oc_e4d2605ca917e695f54f11aaf56*****" // 卡片所在的会话 ID
        }
    }
}
```

## 示例代码

以下 JSON 2.0 结构的示例代码可实现如下图所示的卡片效果。

![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/5678dab3ae875312a7b55b18067790ca_8gk7UBwHfi.png?height=565&lazyload=true&maxWidth=400&width=696)

```json
{
  "schema": "2.0",
  "body": {
    "elements": [
      {
        "tag": "form",
        "elements": [
          {
            "tag": "input",
            "element_id": "username",
            "margin": "0px 0px 0px 0px",
            "placeholder": {
              "tag": "plain_text",
              "content": "请输入"
            },
            "default_value": "",
            "width": "default",
            "label": {
              "tag": "plain_text",
              "content": "用户名："
            },
            "name": "Input_31q6mtuvdx9"
          },
          {
            "tag": "input",
            "element_id": "password",
            "margin": "0px 0px 0px 0px",
            "input_type": "password",
            "placeholder": {
              "tag": "plain_text",
              "content": "请输入"
            },
            "default_value": "",
            "width": "default",
            "label": {
              "tag": "plain_text",
              "content": "密码："
            },
            "label_position": "top",
            "name": "Input_5hez3q41fck"
          },
          {
            "tag": "input",
            "element_id": "address",
            "margin": "0px 0px 0px 0px",
            "input_type": "multiline_text",
            "rows": 4,
            "auto_resize": true,
            "placeholder": {
              "tag": "plain_text",
              "content": "请输入"
            },
            "default_value": "",
            "width": "default",
            "label": {
              "tag": "plain_text",
              "content": "收货地址："
            },
            "name": "Input_u2k3lbrokvd"
          },
          {
            "tag": "column_set",
            "flex_mode": "none",
            "background_style": "default",
            "horizontal_spacing": "default",
            "columns": [
              {
                "tag": "column",
                "width": "auto",
                "vertical_align": "top",
                "elements": [
                  {
                    "tag": "button",
                    "text": {
                      "tag": "plain_text",
                      "content": "提交"
                    },
                    "type": "primary",
                    "action_type": "form_submit",
                    "name": "Button_lrocopxs"
                  }
                ]
              },
              {
                "tag": "column",
                "width": "auto",
                "vertical_align": "top",
                "elements": [
                  {
                    "tag": "button",
                    "text": {
                      "tag": "plain_text",
                      "content": "取消"
                    },
                    "type": "default",
                    "action_type": "form_reset",
                    "name": "Button_lrocopxt"
                  }
                ]
              }
            ],
            "margin": "0px"
          }
        ],
        "name": "Form_lrocopxr"
      }
    ]
  }
}
```