# 表单容器

在使用卡片收集内容时，可能存在需要用户提交多个表单项的场景。表单容器允许用户在前端本地录入一批表单项后，通过点击一次 **提交** 按钮，将这一批本地缓存的表单内容一次回调至开发者的服务端，实现异步提交多个表单项数据的效果。

本文档介绍表单容器的 JSON 2.0 结构，要查看历史 JSON 1.0 结构，参考[表单容器](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-components/containers/form-container)。

![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/3431ef3f14bc707acaf00093f55df9b1_736bnZnIuR.png?height=491&lazyload=true&maxWidth=400&width=794)

## 注意事项

容器类组件最多支持嵌套五层组件。建议你避免在表单容器中嵌套多层组件。多层嵌套会压缩内容的展示空间，影响卡片的展示效果。如你希望卡片承接更复杂的表单内容，建议通过卡片链接跳转至 H5 或小程序实现表单能力。

## 嵌套规则

在[卡片 JSON 2.0 结构](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-structure)中：
- 表单容器不支持内嵌表格（table）和表单容器组件。
- 表单容器组件不可被内嵌在其它组件内，只可放在卡片根节点下。

## 组件属性

本小节介绍表单容器的属性。

### JSON 结构

以下为表单容器的卡片 JSON 2.0 结构。在该结构中，容器内嵌了一个输入框组件、一个提交按钮和一个清空所填内容的按钮，且两个按钮放置于分栏组件中：

```json
{
  "schema": "2.0",
  "body": {
    "elements": [
      {
        "tag": "form", // 表单容器的标签。
        "element_id": "custom_id", // 操作组件的唯一标识。用于在调用组件相关接口中指定组件。需开发者自定义。
        "direction": "horizontal", // 容器内组件的排列方向。可选值："vertical"（垂直排列）、"horizontal"（水平排列）。默认为 "vertical"。
        "horizontal_spacing": "8px", // 容器内组件之间的间距，可选值："small"(4px)、"medium"(8px)、"large"(12px)、"extra_large"(16px)或[0,99]px。
        "vertical_spacing": "8px", // 容器内组件的纵向间距。可选值："small"(4px)、"medium"(8px)、"large"(12px)、"extra_large"(16px)或[0,99]px。
        "horizontal_align": "left", // 容器内组件水平对齐的方式。默认值 left。
        "vertical_align": "top", // 容器内组件的垂直对齐方式，可选值："top"、"center"、"bottom"，默认值为 "top"。
        "padding": "4px 0px 4px 0px", // 容器的内边距。默认值 0px。支持范围 [0,99]px。
        "margin": "0px 0px 0px 0px", // 容器的外边距，默认值 "0"，支持范围 [-99,99]px。
        "name": "form_1", // 该表单容器的唯一标识。用于识别用户在交互后，提交的是哪个表单容器的数据。
        "elements": [
          {
            "tag": "input", // 为表单容器内添加一个输入框组件。
            "name": "reason", // 输入框组件的唯一标识。用于识别用户在交互后，提交的是哪个表单项的数据。在表单容器中所有的交互组件中，该字段必填，否则数据会发送失败。
            "required": true // 是否必填。为 true 时点击按钮后会做必填校验。
          },
          {
            "tag": "column_set", // 表单容器内嵌分栏组件。用于放置“提交”按钮和“取消”按钮。
            "columns": [
              { // 分栏容器中的列。
                "tag": "column", // 分栏组件内的第一列。
                "width": "auto", // 列宽设置。auto 为自适应。
                "elements": [ // 列容器内嵌的组件。
                  {
                    "tag": "button", // 添加一个用于提交数据的按钮组件。表单容器中必须至少有一个带有提交属性的按钮。
                    "type": "primary", // 按钮的样式类型。
                    "text": { // 按钮上的文本。
                      "tag": "plain_text",
                      "content": "提交"
                    },
                    "behaviors": [  // 为按钮添加打开链接交互事件或请求回调交互。
                      {
                        "type": "open_url", // 声明按钮的交互类型是打开链接的跳转交互。
                        "default_url": "https://www.baidu.com", // 兜底跳转地址。
                        "android_url": "https://developer.android.com/", // 安卓端跳转地址。
                        "ios_url": "lark://msgcard/unsupported_action", // iOS 端跳转地址。
                        "pc_url": "https://www.windows.com" // 桌面端跳转地址。
                      },
                      {
                        "type": "callback", // 声明交互类型是回传数据到服务端的请求回调交互。
                        "value": {
                          // 回传交互数据
                          "key": "value"
                        }
                      }
                    ],
                    "form_action_type": "submit", // 将当前按钮与提交事件绑定。用户点击后，将触发表单容器的提交事件，异步提交所有已填写的表单项内容。表单容器中必须至少有一个带有提交属性的按钮。
                    "name": "Button_m8pn9lbf" // 按钮组件的唯一标识，用于识别用户在交互后，点击的是哪个按钮。在表单容器中所有的交互组件中，该字段必填，否则数据会发送失败。
                  }
                ]
              },
              {
                "tag": "column", // 分栏组件内的第二列。
                "width": "auto", // 列宽设置。auto 为自适应。
                "elements": [ // 列容器内嵌的组件。
                  {
                    "tag": "button", //添加一个用于清空已填写内容的按钮组件
                    "type": "default", // 按钮的样式类型。default 为次按钮样式。
                    "text": { // 按钮上的文本。
                      "tag": "plain_text",
                      "content": "取消"
                    },
                    "behaviors": [
                      {
                        "type": "open_url", // 声明交互类型是打开链接的跳转交互。
                        "default_url": "https://www.baidu.com", // 兜底跳转地址。
                        "android_url": "https://developer.android.com/", // 安卓端跳转地址。
                        "ios_url": "lark://msgcard/unsupported_action", // iOS 端跳转地址。
                        "pc_url": "https://www.windows.com" // 桌面端跳转地址。
                      },
                      {
                        "type": "callback", // 声明交互类型是回传数据到服务端的回传交互。
                        "value": {
                          // 回传交互数据
                          "key": "value"
                        }
                      }
                    ],
                    "form_action_type": "reset", // 将当前按钮设为重置。用户点击后，将重置所有已填写的表单项内容。
                    "name": "Button_m8pn9lbg" // 按钮组件的唯一标识，用于识别用户在交互后，点击的是哪个按钮。在表单容器中所有的交互组件中，该字段必填，否则数据会发送失败。
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### 字段说明

表单容器各字段说明如下表所示：

名称 | 必填 | 类型 | 默认值 | 说明
---|---|---|---|---
tag | 是 | String | / | 表单容器的标签。固定值为 `form`。
element_id | 否 | String | 空 | 操作组件的唯一标识。JSON 2.0 新增属性。用于在调用[组件相关接口](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card-element/create)中指定组件。在同一张卡片内，该字段的值全局唯一。仅允许使用字母、数字和下划线，必须以字母开头，不得超过 20 字符。
direction | 否 | String | vertical | 容器内组件的排列方向。可选值：<br>- vertical：垂直排列<br>- horizontal：水平排列
margin | 否 | String | 0px | 容器的外边距。值的取值范围为 [-99,99]px。可选值：<br>- 单值，如 "10px"，表示容器的四个外边距都为 10 px。<br>- 双值，如 "4px 0"，表示容器的上下外边距为 4 px，左右外边距为 0 px。使用空格间隔（边距为 0 时可不加单位）。<br>- 多值，如 "4px 0 4px 0"，表示容器的上、右、下、左的外边距分别为 4px，12px，4px，12px。使用空格间隔。
padding | 否 | String | 0px | 容器的内边距。值的取值范围为 [-99,99]px。可选值：<br>- 单值，如 "10px"，表示容器的四个外边距都为 10 px。<br>- 双值，如 "4px 0"，表示容器的上下外边距为 4 px，左右外边距为 0 px。使用空格间隔（边距为 0 时可不加单位）。<br>- 多值，如 "4px 0 4px 0"，表示容器的上、右、下、左的外边距分别为 4px，12px，4px，12px。使用空格间隔。
horizontal_spacing | 否 | String | 8px | 容器内组件的水平间距，可选值：<br>- small：小间距，4px<br>- medium：中等间距，8px<br>- large：大间距，12px<br>- extra_large：超大间距，16px<br>- 具体数值，如 20px。取值范围为 [0,99]px
horizontal_align | 否 | String | left | 容器内组件水平对齐的方式。可取值：<br>- left：左对齐<br>- center：居中对齐<br>- right：右对齐
vertical_align | 否 | String | top | 容器内组件垂直对齐的方式。可取值：<br>- top：上对齐<br>- center：居中对齐<br>- bottom：下对齐
vertical_spacing | 否 | String | 12px | 容器内组件的垂直间距，可选值：<br>- small：小间距，4px<br>- medium：中等间距，8px<br>- large：大间距，12px<br>- extra_large：超大间距，16px<br>- 具体数值，如 20px。取值范围为 [0,99]px
name | 是 | String | 无 | 表单容器的唯一标识。用于识别用户提交的数据属于哪个表单容器。在同一张卡片内，该字段的值全局唯一。
elements | 是 | Array&lt;element&gt; | [] | 表单容器的子节点。可内嵌其它容器类组件和展示、交互组件，不支持内嵌表格、图表、和表单容器组件。
└ tag | 是 | String | 无 | 表单容器中内嵌的组件的标签，支持除表格（table）和表单容器以外的所有组件。 <br>**注意**：表单容器内必须包含一个用于提交表单的[按钮](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/interactive-components/button)组件。
└ name | 是 | String | 无 | 表单容器内组件的唯一标识。用于识别用户提交的数据属于哪个组件。<br>**注意**：<br>在表单容器中所有的交互组件中，该字段必填且需在卡片全局内唯一，否则数据会发送失败。
└ required | 否 | Boolean | false | 组件的内容是否必填。当组件内嵌在表单容器中时，该属性生效。可取值：<br>- **true**：必填。当用户点击表单容器的“提交”时，未填写该组件，则前端提示“有必填项未填写”，不会向开发者的服务端发起回传请求。<br>- **false**：选填。当用户点击表单容器的“提交”时，未填写该组件，仍提交表单容器中的数据。
└ form_action_type | 是 | String | 空 | 内嵌在表单容器中的按钮的交互类型。枚举值包括：<br>- <code>submit</code>：将当前按钮与提交事件绑定。用户点击后，将触发表单容器的提交事件，异步提交所有已填写的表单项内容<br>- <code>reset</code>：将当前按钮与取消提交事件绑定。用户点击后，将触发表单容器的取消提交事件，重置所有表单组件的输入值为初始值
└ action_type（历史属性） | 是 | String | 空 | 内嵌在表单容器中的按钮的交互类型。枚举值包括：<br>- <code>link</code>：当前按钮仅支持链接跳转</li><br><li><code>request</code>：当前按钮仅支持回传交互</li><br><li><code>multi</code>：当前按钮同时支持链接跳转和回传交互</li><br><li><code>form_submit</code>：将当前按钮与提交事件绑定。用户点击后，将触发表单容器的提交事件，异步提交所有已填写的表单项内容</li><br><li><code>form_reset</code>：将当前按钮与取消提交事件绑定。用户点击后，将触发表单容器的取消提交事件，重置所有表单组件的输入值为初始值</li><br>**注意**：表单容器内必须包含一个用于提交表单的按钮组件。此时 `action_type` 固定取值 `form_submit`，表示提交表单。
## 回调结构<br>当用户点击表单容器的提交按钮时，你在开发者后台配置的请求地址将会收到如下所示的回调数据。如果你添加的是新版卡片回传交互回调(`card.action.trigger`)，回调数据的结构如下所示。更多参数说明可参考[卡片回传交互](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-callback-communication)。<br>```json<br>{<br>"schema": "2.0", // 回调的版本<br>"header": { // 回调基本信息<br>"event_id": "f7984f25108f8137722bb63c*****", // 回调的唯一标识<br>"token": "066zT6pS4QCbgj5Do145GfDbbag*****", // 应用的 Verification Token<br>"create_time": "1603977298000000", // 	回调发送的时间，接近回调发生的时间<br>"event_type": "card.action.trigger", // 回调类型卡片交互场景中，固定为 "card.action.trigger"<br>"tenant_key": "2df73991750*****", // 应用归属的 tenant key，即租户唯一标识<br>"app_id": "cli_a5fb0ae6a4******" // 应用的 App ID<br>},<br>"event": { // 回调的详细信息<br>"operator": { // 	回调触发者信息<br>"tenant_key": "2df73991750*****", // 回调触发者的 tenant key，即租户唯一标识<br>"user_id": "867*****", // 回调触发者的 user ID当应用开启“获取用户 user ID”权限后，该参数返回<br>"open_id": "ou_3c14f3a59eaf2825dbe25359f15*****", // 	回调触发者的 Open ID<br>"union_id": "on_cad4860e7af114fb4ff6c5d496d*****" // 回调触发者的 Union ID<br>},<br>"token": "c-295ee57216a5dc9de90fefd0aadb4b1d7d******", // 更新卡片用的凭证，有效期为 30 分钟，最多可更新 2 次<br>"action": { // 用户操作交互组件回传的数据<br>"value": { // 如果组件中配置了 value （历史属性）或 behaviors 属性，则在此处返回自定义的回传交互参数<br>"key_1": "value_1"<br>},<br>"tag": "button", // 表单组件中按钮组件的标签。<br>"timezone": "Asia/Shanghai", // 用户当前所在地区的时区。<br>"form_value": { // 表单容器内用户提交的数据。以下为示例数据：<br>"DatePicker_bpqdq5puvn4": "2024-04-01 +0800", // 表单容器内日期选择器组件的表单项标识 name（开发者可自定义）和用户提交的日期 value<br>"DateTimePicker_ihz2d7a74i": "2024-04-29 07:07 +0800", // 表单容器内日期时间选择器组件的表单项标识 name（开发者可自定义）和用户提交的日期时间<br>"Input_lf4fmxwfrd9": "1234", // 表单容器内输入框组件的表单项标识 name（开发者可自定义）和用户提交的值<br>"PersonSelect_2ejys7ype7m": "ou_3c14f3a59eaf2825dbe25359f1595b00", // 表单容器内人员选择-单选组件的表单项标识 name（开发者可自定义）和用户提交的值<br>"Select_a2d5b7l3zd": "1", // 表单容器内下拉选择-单选组件的表单项标识 name（开发者可自定义）和用户提交的值<br>"TimePicker_7ecsf6xkqsq": "00:00 +0800"// 表单容器内时间选择器组件的表单项标识 name（开发者可自定义）和用户提交的时间<br>},<br>"name": "Button_lvkepfu3" // 表单容器中提交按钮的表单项标识 name<br>},<br>"host": "im_message", // 卡片展示场景<br>"context": { //  卡片展示场景相关信息<br>"open_message_id": "om_574d639e4a44e4dd646eaf628e2*****", // 卡片所在的消息 ID<br>"open_chat_id": "oc_e4d2605ca917e695f54f11aaf56*****" // 卡片所在的会话 ID<br>}<br>}<br>}<br>```<br>## 示例代码<br>以下 JSON 2.0 结构的示例代码可实现如下图所示的卡片效果：<br>![](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/3431ef3f14bc707acaf00093f55df9b1_736bnZnIuR.png?height=491&lazyload=true&maxWidth=400&width=794)<br>```json<br>{<br>"schema": "2.0",<br>"body": {<br>"elements": [<br>{<br>"tag": "markdown",<br>"content": "**项目名称**：业务做大做强",<br>"text_align": "left",<br>"text_size": "normal",<br>"icon": {<br>"tag": "standard_icon",<br>"token": "add-app_outlined",<br>"color": "grey"<br>}<br>},<br>{<br>"tag": "form",<br>"elements": [<br>{<br>"tag": "column_set",<br>"horizontal_spacing": "8px",<br>"horizontal_align": "left",<br>"columns": [<br>{<br>"tag": "column",<br>"width": "weighted",<br>"elements": [<br>{<br>"tag": "markdown",<br>"content": "**经办人***",<br>"text_align": "left",<br>"text_size": "normal",<br>"icon": {<br>"tag": "standard_icon",<br>"token": "member_outlined",<br>"color": "light_grey"<br>}<br>}<br>],<br>"padding": "0px 0px 0px 0px",<br>"vertical_spacing": "8px",<br>"weight": 1<br>},<br>{<br>"tag": "column",<br>"width": "weighted",<br>"elements": [<br>{<br>"tag": "select_person",<br>"placeholder": {<br>"tag": "plain_text",<br>"content": "请选择"<br>},<br>"options": [],<br>"width": "fill",<br>"type": "default",<br>"required": true,<br>"name": "PersonSelect_rg0ml5mh"<br>}<br>],<br>"padding": "0px 0px 0px 0px",<br>"vertical_spacing": "8px",<br>"weight": 4<br>}<br>],<br>"margin": "16px 0px 16px 0px"<br>},<br>{<br>"tag": "column_set",<br>"horizontal_spacing": "8px",<br>"horizontal_align": "left",<br>"columns": [<br>{<br>"tag": "column",<br>"width": "weighted",<br>"elements": [<br>{<br>"tag": "markdown",<br>"content": "**优先级***",<br>"text_align": "left",<br>"text_size": "normal",<br>"icon": {<br>"tag": "standard_icon",<br>"token": "msgcard-rectangle_outlined",<br>"color": "grey"<br>}<br>}<br>],<br>"padding": "0px 0px 0px 0px",<br>"vertical_spacing": "8px",<br>"weight": 1<br>},<br>{<br>"tag": "column",<br>"width": "weighted",<br>"elements": [<br>{<br>"tag": "select_static",<br>"placeholder": {<br>"tag": "plain_text",<br>"content": "请选择"<br>},<br>"options": [<br>{<br>"text": {<br>"tag": "plain_text",<br>"content": "P0"<br>},<br>"value": "1",<br>"icon": {<br>"tag": "standard_icon",<br>"token": "sheet-iconsets-increase_filled"<br>}<br>},<br>{<br>"text": {<br>"tag": "plain_text",<br>"content": "P1"<br>},<br>"value": "P1",<br>"icon": {<br>"tag": "standard_icon",<br>"token": "sheet-iconsets-stable_filled"<br>}<br>},<br>{<br>"text": {<br>"tag": "plain_text",<br>"content": "P2"<br>},<br>"value": "3",<br>"icon": {<br>"tag": "standard_icon",<br>"token": "expand-down_filled"<br>}<br>}<br>],<br>"type": "default",<br>"width": "fill",<br>"required": true,<br>"name": "Select_01taxkgaqc6c"<br>}<br>],<br>"padding": "0px 0px 0px 0px",<br>"vertical_spacing": "8px",<br>"weight": 4<br>}<br>],<br>"margin": "16px 0px 16px 0px"<br>},<br>{<br>"tag": "column_set",<br>"horizontal_spacing": "8px",<br>"horizontal_align": "left",<br>"columns": [<br>{<br>"tag": "column",<br>"width": "weighted",<br>"elements": [<br>{<br>"tag": "markdown",<br>"content": "**项目评论**",<br>"text_align": "left",<br>"text_size": "normal",<br>"icon": {<br>"tag": "standard_icon",<br>"token": "chat_outlined",<br>"color": "grey"<br>}<br>}<br>],<br>"padding": "0px 0px 0px 0px",<br>"vertical_spacing": "8px",<br>"weight": 1<br>},<br>{<br>"tag": "column",<br>"width": "weighted",<br>"elements": [<br>{<br>"tag": "input",<br>"placeholder": {<br>"tag": "plain_text",<br>"content": "请输入"<br>},<br>"default_value": "",<br>"width": "fill",<br>"name": "Input_0bqcy75cxklr",<br>"fallback": {<br>"tag": "fallback_text",<br>"text": {<br>"tag": "plain_text",<br>"content": "仅支持在 V6.8 及以上版本使用"<br>}<br>}<br>}<br>],<br>"padding": "0px 0px 0px 0px",<br>"vertical_spacing": "8px",<br>"weight": 4<br>}<br>],<br>"margin": "16px 0px 16px 0px"<br>},<br>{<br>"tag": "column_set",<br>"flex_mode": "bisect",<br>"horizontal_spacing": "8px",<br>"horizontal_align": "right",<br>"columns": [<br>{<br>"tag": "column",<br>"width": "auto",<br>"elements": [<br>{<br>"tag": "button",<br>"text": {<br>"tag": "plain_text",<br>"content": "提交"<br>},<br>"type": "primary_filled",<br>"width": "default",<br>"icon": {<br>"tag": "standard_icon",<br>"token": "thumbsup_outlined"<br>},<br>"form_action_type": "submit",<br>"name": "Button_lq544v6r"<br>}<br>],<br>"padding": "0px 0px 0px 0px",<br>"vertical_spacing": "8px"<br>},<br>{<br>"tag": "column",<br>"width": "auto",<br>"elements": [<br>{<br>"tag": "button",<br>"text": {<br>"tag": "plain_text",<br>"content": "取消"<br>},<br>"type": "default",<br>"width": "default",<br>"form_action_type": "reset",<br>"name": "Button_lq544v6s"<br>}<br>],<br>"padding": "0px 0px 0px 0px",<br>"vertical_spacing": "8px"<br>}<br>],<br>"margin": "0px 0px 0px 0px"<br>}<br>],<br>"name": "Form_lq544v6q",<br>"fallback": {<br>"tag": "fallback_text",<br>"text": {<br>"tag": "plain_text",<br>"content": "仅支持在 V6.6 及以上版本使用"<br>}<br>}<br>}<br>]<br>}<br>}<br>```
