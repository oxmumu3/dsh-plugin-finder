// v8 样式层。类名统一前缀 pf8_，颜色只引用 v8-tokens 里的变量。
// 数值取自 finder-v8.html 的 CSS（SPEC 第 1 节要求直接照抄）。

export const v8Css = `
/* —— 底座 —— */
.pf_v8 { font: 15px/1.6 var(--sans); color: var(--ink); background: transparent; -webkit-font-smoothing: antialiased; }
:where(.pf_v8 :is(div, section, article, header, footer, main, nav, aside, form, fieldset, details, summary, dialog, ul, ol, li, dl, dt, dd, h1, h2, h3, h4, p, span, b, strong, i, em, a, code, pre, button, input, textarea, select, label, svg)) { box-sizing: border-box; }
.pf_v8 h1, .pf_v8 h2, .pf_v8 h3, .pf_v8 p, .pf_v8 ul, .pf_v8 ol { margin: 0; padding: 0; }
.pf_v8 ul, .pf_v8 ol { list-style: none; }
.pf_v8 button { font: inherit; color: inherit; cursor: pointer; background: none; border: 0; padding: 0; }
.pf_v8 :focus-visible { outline: 2px solid var(--have); outline-offset: 2px; border-radius: 6px; }
.pf_v8 .pf8_wrap { max-width: 1080px; margin: 0 auto; padding: 40px 40px 96px; }
@container finder (max-width: 700px) { .pf_v8 .pf8_wrap { padding: 24px 16px 72px; } }

/* —— 积木 —— */
.pf_v8 .pf8_pc { --h: 1em; height: var(--h); width: auto; flex: none; vertical-align: -.19em; margin: 0 .02em 0 -.1em; overflow: visible; }
.pf_v8 .pf8_pc path { stroke-width: 0; stroke-linejoin: round; }
.pf_v8 .pf8_pc .have { fill: color-mix(in srgb, var(--have) 16%, transparent); stroke: var(--have); stroke-width: 1.3; }
.pf_v8 .pf8_pc .done { fill: color-mix(in srgb, var(--ok) 72%, transparent); }
.pf_v8 .pf8_pc .build { fill: color-mix(in srgb, var(--build) 9%, transparent); stroke: var(--build); stroke-width: 1.3; stroke-dasharray: 2.6 2.3; stroke-linecap: round; }
.pf_v8 .pf8_pc .ghost { fill: none; stroke: var(--line2); stroke-width: 1.3; }
.pf_v8 .pf8_pc .slot { fill: none; stroke: var(--line2); stroke-width: 1.3; stroke-dasharray: 2.6 2.3; stroke-linecap: round; }
.pf_v8 .pf8_pc .seen { fill: var(--line); }
.pf_v8 .pf8_pc .mark { fill: var(--ink); }

/* —— 顶行 —— */
.pf_v8 .pf8_top { display: flex; align-items: center; gap: 10px; margin-bottom: 56px; font-size: 14px; }
.pf_v8 .pf8_top .pf8_pc { --h: 26px; margin: 0 -2px 0 -4px; }
.pf_v8 .pf8_top strong { font-weight: 600; }
.pf_v8 .pf8_top nav { margin-left: auto; display: flex; align-items: baseline; gap: 20px; }
/* 「更多」收在 v8 顶栏最右边：三个原动作都在这里，外观仍是文字链接。
   类名避开首页「也可以逛逛插件商店」那句的 .pf8_more。 */
.pf_v8 .pf8_topmore { position: relative; display: inline-flex; align-self: baseline; }
.pf_v8 .pf8_topmore > summary { list-style: none; cursor: pointer; min-height: 0; height: auto; padding: 0; line-height: 1.5; }
.pf_v8 .pf8_topmore > summary::-webkit-details-marker { display: none; }
.pf_v8 .pf8_topmore_menu { position: absolute; right: 0; top: calc(100% + 10px); z-index: 30; display: grid; gap: 2px; min-width: 176px; padding: 6px; border: 1px solid var(--line2); border-radius: 14px; background: var(--card); box-shadow: 0 12px 30px color-mix(in srgb, var(--ink) 14%, transparent); }
.pf_v8 .pf8_topmore_item { text-align: left; padding: 8px 10px; border-radius: 9px; color: var(--ink2); font-size: 13px; white-space: nowrap; }
.pf_v8 .pf8_topmore_item:hover:not(:disabled) { background: var(--hover); color: var(--ink); }
.pf_v8 .pf8_topmore_item:disabled { opacity: .4; cursor: default; }
.pf_v8 .pf8_lk { color: var(--ink3); font-size: 13px; border-bottom: 1px solid var(--line2); line-height: 1.5; }
.pf_v8 .pf8_lk:hover { color: var(--ink); }
@container finder (max-width: 700px) { .pf_v8 .pf8_top { margin-bottom: 32px; } }

/* —— 首页开头 —— */
.pf_v8 .pf8_hero { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 56px; align-items: start; }
/* 右边没有已装清单时整块不显示：首页开头变成单栏（SPEC 5.1）。 */
.pf_v8 .pf8_hero:not(:has(.pf8_mine)) { grid-template-columns: minmax(0, 1fr); gap: 0; }
.pf_v8 .pf8_meta { font-size: 13px; color: var(--ink3); margin-bottom: 10px; }
.pf_v8 .pf8_line { font: 400 clamp(23px, 3.3cqw, 31px)/1.5 var(--serif); letter-spacing: .01em; text-wrap: balance; }
.pf_v8 .pf8_line .pf8_lk { font: 14px/1.5 var(--sans); letter-spacing: 0; vertical-align: .3em; white-space: nowrap; color: var(--ink2); }
.pf_v8 .pf8_ask { display: flex; align-items: center; gap: 8px; margin-top: 22px; border: 1px solid var(--line2); border-radius: 32px; background: var(--card); padding: 8px 8px 8px 24px; max-width: 720px; }
.pf_v8 .pf8_ask:focus-within { border-color: var(--ink3); }
.pf_v8 .pf8_ask input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: 16px var(--sans); height: 40px; }
.pf_v8 .pf8_ask input::placeholder { color: var(--ink3); }
.pf_v8 .pf8_send { display: flex; align-items: center; justify-content: center; flex: none; width: 40px; height: 40px; border-radius: 50%; background: var(--primary); color: var(--on-primary); }
.pf_v8 .pf8_send[disabled] { opacity: .3; cursor: default; }
.pf_v8 .pf8_send svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.pf_v8 .pf8_key { display: flex; flex-wrap: wrap; gap: 8px 26px; margin-top: 36px; font-size: 12.5px; color: var(--ink3); }
.pf_v8 .pf8_key span { display: inline-flex; align-items: center; white-space: nowrap; }
.pf_v8 .pf8_key .pf8_pc { --h: 19px; margin: 0 7px 0 0; }
.pf_v8 .pf8_tries { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; align-items: center; font-size: 13px; color: var(--ink3); }
.pf_v8 .pf8_pill { display: inline-flex; align-items: center; height: 30px; padding: 0 12px; border-radius: 15px; border: 1px solid var(--line); color: var(--ink2); font-size: 13px; white-space: nowrap; }
.pf_v8 .pf8_pill:hover:not(:disabled) { background: var(--hover); }
.pf_v8 .pf8_eglead { margin-top: 26px; font-size: 13px; color: var(--ink3); }
.pf_v8 .pf8_eglead .pf8_lk { font-size: 13px; }
/* 示例区：例句是可点的胶囊，只示范「可以这样说」，不和结果配对。
   三种办法是纯说明，不进 Tab 顺序。版式照 finder-v8-examples.html 的
   .says / .waylead / .ways / .way。 */
.pf_v8 .pf8_says { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; max-width: 748px; }
.pf_v8 .pf8_says .pf8_pill { height: 32px; border-radius: 16px; padding: 0 14px; border-color: var(--line2); }
.pf_v8 .pf8_waylead { margin-top: 30px; font-size: 13px; color: var(--ink3); }
.pf_v8 .pf8_ways { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; margin-top: 8px; max-width: 748px; }
.pf_v8 .pf8_way { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.pf_v8 .pf8_way .pf8_wayres { font: 400 18px/1.45 var(--serif); color: var(--ink); }
.pf_v8 .pf8_way .pf8_waygot { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; font-size: 12.5px; line-height: 1.5; color: var(--ink2); }
.pf_v8 .pf8_way .pf8_wayrow { display: inline-flex; align-items: center; white-space: nowrap; }
.pf_v8 .pf8_way .pf8_waylego { --h: 21px; margin: 0 7px 0 -2px; }
@container finder (max-width: 700px) {
  .pf_v8 .pf8_says .pf8_pill { height: auto; min-height: 32px; padding: 5px 14px; white-space: normal; text-align: left; }
  .pf_v8 .pf8_ways { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .pf_v8 .pf8_way { padding: 12px 0; border-top: 1px solid var(--line); }
  .pf_v8 .pf8_way .pf8_wayres { font-size: 16px; }
  .pf_v8 .pf8_way .pf8_waygot { margin-top: 6px; flex-direction: row; flex-wrap: wrap; gap: 4px 16px; }
}
.pf_v8 .pf8_mine { padding-top: 30px; }
.pf_v8 .pf8_mine .pf8_rows { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.pf_v8 .pf8_mine .pf8_pc { width: calc(100% + 12px); height: auto; margin: -6px; display: block; }
.pf_v8 .pf8_mine p { margin-top: 16px; font-size: 13px; line-height: 1.7; color: var(--ink3); }
.pf_v8 .pf8_mine p b { font-weight: 500; color: var(--ink2); }
@container finder (max-width: 900px) {
  .pf_v8 .pf8_hero { grid-template-columns: minmax(0, 1fr); gap: 32px; }
  .pf_v8 .pf8_mine { padding-top: 0; }
  .pf_v8 .pf8_mine .pf8_pc { width: auto; height: 34px; margin: -5px; }
  .pf_v8 .pf8_mine .pf8_rows { grid-template-columns: repeat(7, auto); justify-content: start; gap: 6px; }
}

/* —— 分区 —— */
.pf_v8 .pf8_sec { margin-top: 40px; padding-top: 32px; border-top: 1px solid var(--line); }
.pf_v8 .pf8_sec > header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.pf_v8 .pf8_sec h2 { font-size: 14px; font-weight: 600; }
.pf_v8 .pf8_sec header span { font-size: 13px; color: var(--ink3); }
.pf_v8 .pf8_sec header .pf8_lk { margin-left: auto; }
.pf_v8 .pf8_two { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); gap: 56px; }
/* 精选整块不出现时，剩下的那一栏占满，不留一条空列。 */
.pf_v8 .pf8_two.pf8_single { grid-template-columns: minmax(0, 1fr); }
.pf_v8 .pf8_two .pf8_sec { margin-top: 48px; }
@container finder (max-width: 900px) { .pf_v8 .pf8_two { grid-template-columns: minmax(0, 1fr); gap: 0; } }

/* —— 猜你需要 —— */
.pf_v8 .pf8_guess { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 14px; }
.pf_v8 .pf8_guess li { display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 22px 22px 18px; min-width: 0; }
.pf_v8 .pf8_guess .pf8_g { display: block; height: 40px; }
.pf_v8 .pf8_guess .pf8_g .pf8_pc { --h: 44px; margin: -4px 0 0 -6px; vertical-align: top; }
.pf_v8 .pf8_guess b { display: block; margin-top: 14px; font: 400 19px/1.5 var(--serif); }
.pf_v8 .pf8_guess small { display: block; font-size: 13px; line-height: 1.6; color: var(--ink3); margin-top: 6px; }
/* 宿主里的「猜你需要」：保留 opportunity-view 的条件与动作，只把表现层套成 v8 卡片。 */
.pf_v8 .pf8_oppcard { display: block; width: 100%; max-width: calc((100% - 32px) / 3); min-width: 0; margin-top: 14px; background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 22px 22px 18px; }
.pf_v8 .pf8_oppcard > h2, .pf_v8 .pf8_oppcard > .pfv_home_lead { display: none; }
.pf_v8 .pf8_oppcard .pfv_home_card { display: block; padding: 0; border: 0; background: transparent; box-shadow: none; }
.pf_v8 .pf8_oppcard .pfv_home_card h3 { font: 400 19px/1.5 var(--serif); }
.pf_v8 .pf8_oppcard .pfv_prose { margin-top: 4px; font-size: 13.5px; line-height: 1.7; color: var(--ink2); }
.pf_v8 .pf8_oppcard .pfv_scenario_reason { display: block; margin-top: 6px; font-size: 12px; color: var(--ink3); }
.pf_v8 .pf8_oppcard .pfv_composer_bottom { margin-top: 14px; }
.pf_v8 .pf8_oppcard .pfv_button { display: inline-flex; align-items: center; height: 36px; padding: 0 16px; border: 1px solid var(--line2); border-radius: 18px; background: transparent; color: var(--ink); font-size: 13.5px; }
.pf_v8 .pf8_oppcard .pfv_scenario_start { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.pf_v8 .pf8_oppcard .pfv_opportunity_evidence { margin-top: 12px; }
.pf_v8 .pf8_oppcard .pfv_opportunity_evidence > summary, .pf_v8 .pf8_oppcard .pfv_opportunity_controls summary { cursor: pointer; color: var(--ink3); font-size: 12.5px; }
.pf_v8 .pf8_oppcard .pfv_opportunity_controls { display: flex; flex-wrap: wrap; gap: 10px 16px; margin-top: 14px; }
.pf_v8 .pf8_oppcard .pfv_warning { margin-top: 10px; color: var(--build); font-size: 12.5px; }
.pf_v8 .pf8_oppcard .pfv_hint { width: 100%; font-size: 12px; color: var(--ink3); }
.pf_v8 .pf8_oppcard .pf8_pc { --h: 24px; margin: 2px 0 8px -2px; }
.pf_v8 .pf8_guess .pf8_do { display: flex; gap: 8px; align-items: center; margin-top: auto; padding-top: 18px; }
.pf_v8 .pf8_sec .pfv_home_scenario:not(.pf8_oppcard) { border-top: 0; padding-top: 0; margin-top: 0; }
.pf_v8 .pf8_idea { display: block; margin-top: 14px; padding: 22px 22px 18px; background: var(--card); border: 1px solid var(--line); border-radius: 20px; max-width: calc((100% - 32px) / 3); }
.pf_v8 .pf8_idea .pf8_pc { --h: 44px; margin: -4px 0 12px -6px; vertical-align: top; }
.pf_v8 .pf8_idea h3 { margin: 0; font: 400 19px/1.5 var(--serif); }
.pf_v8 .pf8_idea_benefit { margin-top: 6px; font-size: 13px; line-height: 1.6; color: var(--ink2); }
.pf_v8 .pf8_idea .pf8_btn { margin-top: 14px; }
.pf_v8 .pf8_solution { margin-top: 14px; padding: 20px 22px; border: 1px solid var(--line); border-radius: 20px; background: var(--card); }
.pf_v8 .pf8_solution_quote { font-size: 13.5px; line-height: 1.7; color: var(--ink2); }
.pf_v8 .pf8_solution_line { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin-top: 12px; font: 400 18px/1.5 var(--serif); }
.pf_v8 .pf8_solution_line .pf8_pc { --h: 22px; margin: 0 6px 0 0; }
.pf_v8 .pf8_solution_parts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
.pf_v8 .pf8_part { border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; background: var(--bg); }
.pf_v8 .pf8_part.pf8_new { border-color: color-mix(in srgb, var(--build) 45%, var(--line)); background: color-mix(in srgb, var(--build) 8%, var(--card)); }
.pf_v8 .pf8_part code { display: block; font: 500 12.5px var(--mono); overflow-wrap: anywhere; }
.pf_v8 .pf8_part small { display: block; margin-top: 4px; font-size: 12px; line-height: 1.55; color: var(--ink3); }
@container finder (max-width: 700px) { .pf_v8 .pf8_solution_parts { grid-template-columns: minmax(0, 1fr); } }
@container finder (max-width: 900px) {
  .pf_v8 .pf8_guess { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .pf_v8 .pf8_guess li { padding: 18px 18px 16px; }
  .pf_v8 .pf8_idea { max-width: none; }
}

/* —— 按钮 —— */
.pf_v8 .pf8_btn { display: inline-flex; align-items: center; height: 36px; padding: 0 16px; border-radius: 18px; font-size: 13.5px; white-space: nowrap; border: 1px solid var(--line2); color: var(--ink); }
.pf_v8 .pf8_btn:hover:not(:disabled) { background: var(--hover); }
.pf_v8 .pf8_btn.pf8_ink { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.pf_v8 .pf8_btn.pf8_ink:hover { opacity: .88; background: var(--primary); }
.pf_v8 .pf8_btn.pf8_big { height: 42px; border-radius: 21px; padding: 0 20px; font-size: 14.5px; }
.pf_v8 .pf8_btn[disabled] { opacity: .4; cursor: default; }
.pf_v8 .pf8_quiet { font-size: 13px; color: var(--ink3); padding: 0 6px; }
.pf_v8 .pf8_quiet:hover { color: var(--ink); }
.pf_v8 .pf8_more { margin-top: 10px; font-size: 13px; color: var(--ink3); }

/* —— 你交代过的事 —— */
.pf_v8 .pf8_past li { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 12px; padding: 13px 0; border-bottom: 1px solid var(--line); align-items: baseline; }
.pf_v8 .pf8_past li:last-child { border-bottom: 0; }
.pf_v8 .pf8_past .pf8_pc { --h: 24px; margin: -4px; }
.pf_v8 .pf8_past .pf8_g { display: flex; justify-content: flex-start; }
.pf_v8 .pf8_past b { display: block; font-weight: 500; font-size: 14.5px; }
.pf_v8 .pf8_past small { font-size: 13px; color: var(--ink3); }
.pf_v8 .pf8_past button.pf8_row { text-align: left; display: block; width: 100%; }

/* —— 精选 —— */
.pf_v8 .pf8_feat li { border-bottom: 1px solid var(--line); }
.pf_v8 .pf8_feat li:last-child { border-bottom: 0; }
.pf_v8 .pf8_feat .pf8_row { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 10px; width: 100%; text-align: left; padding: 13px 0; align-items: baseline; }
.pf_v8 .pf8_feat .pf8_pc { --h: 22px; margin: -4px; }
.pf_v8 .pf8_feat b { display: block; font: 400 17px/1.45 var(--serif); }
.pf_v8 .pf8_feat small { display: block; font-size: 13px; color: var(--ink3); margin-top: 1px; }
.pf_v8 .pf8_fine { margin-top: 10px; font-size: 12px; line-height: 1.6; color: var(--ink3); }
.pf_v8 .pf8_feat .pf8_row:hover b, .pf_v8 .pf8_cat .pf8_ch:hover b, .pf_v8 .pf8_cat li button:hover code, .pf_v8 .pf8_plist li button:hover code { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px; }

/* —— 插件商店（首页里的块） —— */
.pf_v8 .pf8_ask.pf8_sm { margin-top: 14px; max-width: 520px; padding: 4px 4px 4px 20px; }
.pf_v8 .pf8_ask.pf8_sm input { height: 36px; font-size: 14.5px; }
.pf_v8 .pf8_ask.pf8_sm .pf8_send { width: 36px; height: 36px; }
.pf_v8 .pf8_send.pf8_ghostbtn { background: none; color: var(--ink3); }
.pf_v8 .pf8_send.pf8_ghostbtn:hover { color: var(--ink); }
.pf_v8 .pf8_cats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 36px 48px; margin-top: 30px; }
.pf_v8 .pf8_cat .pf8_ch { display: block; width: 100%; text-align: left; padding-bottom: 10px; border-bottom: 1px solid var(--line2); }
.pf_v8 .pf8_cat .pf8_ch b { font-weight: 600; font-size: 15px; }
.pf_v8 .pf8_cat .pf8_ch i { font-style: normal; color: var(--ink3); margin-left: 8px; font-size: 13px; font-variant-numeric: tabular-nums; }
.pf_v8 .pf8_cat .pf8_ch small { display: block; font-size: 12.5px; color: var(--ink3); margin-top: 1px; }
.pf_v8 .pf8_cat li button { display: block; width: 100%; text-align: left; padding: 10px 0; border-bottom: 1px solid var(--line); }
.pf_v8 .pf8_cat li:last-child button { border-bottom: 0; }
.pf_v8 .pf8_cat code { display: block; font: 500 13px/1.5 var(--mono); color: var(--ink); overflow-wrap: anywhere; }
.pf_v8 .pf8_cat li span { display: block; font-size: 13px; color: var(--ink2); }
.pf_v8 .pf8_foot { margin-top: 56px; font-size: 12px; color: var(--ink3); }
@container finder (max-width: 900px) { .pf_v8 .pf8_cats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 32px; } }
@container finder (max-width: 560px) { .pf_v8 .pf8_cats { grid-template-columns: minmax(0, 1fr); } }

/* —— 商店页 —— */
.pf_v8 .pf8_shopw { max-width: 920px; margin: 0 auto; }
.pf_v8 .pf8_store_back { margin-bottom: 12px; }
.pf_v8 .pf8_store { padding-bottom: 8px; }
.pf_v8 .pf8_store_title h1 { font: 400 clamp(26px, 4.6cqw, 37px)/1.5 var(--serif); letter-spacing: .01em; }
.pf_v8 .pf8_store_title p { margin-top: 12px; max-width: 36em; color: var(--ink2); font-size: 15.5px; line-height: 1.75; }
.pf_v8 .pf8_store_search { display: flex; align-items: center; margin-top: 22px; padding: 8px 24px; border: 1px solid var(--line2); border-radius: 32px; background: var(--card); max-width: 720px; }
.pf_v8 .pf8_store_search input { flex: 1; min-width: 0; height: 40px; border: 0; outline: 0; background: transparent; color: var(--ink); font: 16px var(--sans); }
.pf_v8 .pf8_store_search input::placeholder { color: var(--ink3); }
.pf_v8 .pf8_store_filters { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.pf_v8 .pf8_store_filters button { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 3px 12px; border: 1px solid var(--line); border-radius: 999px; color: var(--ink2); font-size: 12.5px; }
.pf_v8 .pf8_store_filters button small { color: var(--ink3); font-size: 11px; }
.pf_v8 .pf8_store_filters button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--bg); }
.pf_v8 .pf8_store_filters button[aria-pressed="true"] small { color: var(--bg); opacity: .7; }
.pf_v8 .pf8_store_count { margin-top: 20px; color: var(--ink3); font-size: 12.5px; }
.pf_v8 .pf8_store_list { margin-top: 6px; border-top: 1px solid var(--line); }
.pf_v8 .pf8_store_list .pfv_community_entry { display: block; padding: 0; border-bottom: 1px solid var(--line); }
.pf_v8 .pf8_store_list .pfv_community_entry:last-child { border-bottom: 0; }
.pf_v8 .pf8_store_row { display: grid; grid-template-columns: minmax(0, 230px) minmax(0, 1fr) auto; gap: 6px 26px; align-items: baseline; width: 100%; text-align: left; padding: 15px 0; }
.pf_v8 .pf8_store_who { min-width: 0; }
.pf_v8 .pf8_store_who code { display: block; font: 500 13.5px/1.55 var(--mono); overflow-wrap: anywhere; }
.pf_v8 .pf8_store_who small { display: block; margin-top: 1px; font-size: 12px; line-height: 1.55; color: var(--ink3); overflow-wrap: anywhere; }
.pf_v8 .pf8_store_use { min-width: 0; }
.pf_v8 .pf8_store_use b { display: block; font-weight: 400; font-size: 14.5px; line-height: 1.6; overflow-wrap: anywhere; }
.pf_v8 .pf8_store_use small { display: block; margin-top: 1px; font-size: 12.5px; line-height: 1.6; color: var(--ink3); overflow-wrap: anywhere; }
.pf_v8 .pf8_store_v { color: var(--ink3); font-size: 12.5px; line-height: 1.6; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pf_v8 .pf8_store_row:hover .pf8_store_who code { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px; }
.pf_v8 .pf8_count { margin-top: 22px; font-size: 13.5px; color: var(--ink2); }
.pf_v8 .pf8_count b { font-weight: 500; color: var(--ink2); font-variant-numeric: tabular-nums; }
@container finder (max-width: 700px) {
  .pf_v8 .pf8_store_row { grid-template-columns: minmax(0, 1fr) auto; }
  .pf_v8 .pf8_store_use { grid-column: 1 / -1; grid-row: 2; }
}
/* v8 首页补的那些小块：只引用 v8-tokens 里的变量。 */
.pf_v8 .pf8_sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.pf_v8 .pf8_ask textarea { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: 16px/1.5 var(--sans); height: 40px; max-height: 160px; padding: 9px 0; resize: none; overflow-y: auto; }
.pf_v8 .pf8_ask textarea::placeholder { color: var(--ink3); }
.pf_v8 .pf8_sel { margin-top: 12px; font-size: 13px; color: var(--ink3); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pf_v8 .pf8_sel code { font: 500 13px var(--mono); color: var(--ink); }.pf_v8 .pf8_tag { font-size: 11.5px; color: var(--ink3); border: 1px solid var(--line2); border-radius: 10px; padding: 0 7px; }
.pf_v8 .pfv_resume { margin-top: 18px; max-width: 720px; background: var(--card); border: 1px solid var(--line); color: var(--ink); }
.pf_v8 .pfv_resume .pfv_hint { color: var(--ink3); }
.pf_v8 .pfv_resume .pfv_button { display: inline-flex; align-items: center; height: 36px; padding: 0 16px; border: 1px solid var(--line2); border-radius: 18px; color: var(--ink); background: transparent; }
.pf_v8 .pf8_guess_wrap { margin-top: 14px; }
.pf_v8 .pf8_empty_example { padding: 16px 0 4px; }
.pf_v8 .pf8_empty_example .pf8_btn { margin-top: 12px; }
.pf_v8 .pf8_disclosure { margin-top: 14px; }
.pf_v8 .pf8_disclosure > summary { display: inline-block; cursor: pointer; list-style: none; }
.pf_v8 .pf8_disclosure > summary.pf8_lk { border-bottom: 0; }
.pf_v8 .pf8_disclosure > summary::-webkit-details-marker { display: none; }
/* 精选设置仍沿用 v3 的类名，但在 v8 里只呈现墨色链接和橙色提示。 */
.pf_v8 .pf_banner { border-left: 1px solid var(--build); background: color-mix(in srgb, var(--build) 6%, var(--card)); color: var(--ink); }
.pf_v8 .pf_btn.pf_text { min-height: 0; padding: 0; border: 0; border-bottom: 1px solid var(--line2); border-radius: 0; color: var(--ink); background: none; font-size: 13px; }
.pf_v8 .pf_btn.pf_text:hover:not(:disabled) { color: var(--ink); border-bottom-color: var(--ink); background: none; }
.pf_v8 .pf8_disclosure_body { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.pf_v8 .pf8_brand .pf8_pc { --h: 26px; }

/* —— 插件商店 —— */
.pf_v8 .pf8_store_empty { padding: 30px 0; border-top: 1px solid var(--line); }
.pf_v8 .pf8_store_empty p { font-size: 14px; line-height: 1.75; color: var(--ink2); max-width: 44em; }
.pf_v8 .pf8_store_empty_acts { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; margin-top: 18px; }
.pf_v8 .pf8_store_clear { color: var(--ink); font-size: 13px; border-bottom: 1px solid var(--line2); }
.pf_v8 .pf8_store_pages { display: flex; align-items: center; gap: 14px; margin-top: 22px; color: var(--ink3); font-size: 13px; }
.pf_v8 .pf8_store_page { display: inline-flex; align-items: center; height: 36px; padding: 0 16px; border: 1px solid var(--line2); border-radius: 18px; color: var(--ink); font-size: 13.5px; white-space: nowrap; }
.pf_v8 .pf8_store_page:hover:not(:disabled) { background: var(--hover); }
.pf_v8 .pf8_store_page:disabled { opacity: .4; cursor: default; }
/* —— 外壳剩下的东西（SPEC 5.13）：一个底色、提示条、页底两个折叠入口。 —— */
.pf_root.pf_v2, .pf_root.pf_v2:has(.pfv_home), .pf_root.pf_v2:has(.pf8_hero) { background: var(--dsw-alias-bg-base, #f8f8f6); }
.pf_root.pf_v2 > .pf_inner { max-width: none; padding: 16px 0 0; }
/* 外壳提示条：不依赖 .pf_v8 内部的变量，直接引用宿主 token 并带浅色回退；
   宽度等于各页正文的版心宽度（首页 1080-80、方案 860-80、商店/历史 920-80），
   left 与页内文字对齐；窄屏和版心用同一侧内缩。 */
.pf_root.pf_v2 .pf_banner { width: calc(100% - 80px); max-width: 1000px; margin: 0 auto 16px; padding: 10px 16px; border: 1px solid var(--dsw-alias-border-l2, #e7e7e2); border-left: 2px solid var(--dsw-alias-border-l4, #d0d0c9); border-radius: 0 12px 12px 0; background: color-mix(in srgb, var(--dsw-alias-border-l2, #e7e7e2) 16%, transparent); color: var(--dsw-alias-label-primary, #191b1f); font-size: 13px; line-height: 1.7; }
.pf_root.pf_v2:has(.pf8_narrow) .pf_banner { max-width: 780px; }
.pf_root.pf_v2:has(.pf8_shopw) .pf_banner, .pf_root.pf_v2:has(.pf8_histwrap) .pf_banner { max-width: 840px; }
.pf_root.pf_v2 .pf_banner.pf_error { border-left-color: var(--dsw-alias-state-warn-primary, #dd8500); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #dd8500) 9%, transparent); }
.pf_root.pf_v2 .pf_banner .pf_btn { color: var(--dsw-alias-label-primary, #191b1f); border-color: var(--dsw-alias-border-l4, #d0d0c9); }
@container finder (max-width: 700px) { .pf_root.pf_v2 .pf_banner { width: calc(100% - 32px); max-width: none; margin-inline: auto; } }
/* 回传设置：这个 details 自身带 pf_v8，用复合选择器而不是后代选择器。 */
.pf_v8.pf_telemetry { max-width: 1000px; margin: 24px auto 0; padding: 14px 18px; border: 1px solid var(--line); border-radius: 16px; background: var(--card); color: var(--ink); }
.pf_v8.pf_telemetry > summary { cursor: pointer; font-size: 13px; color: var(--ink2); }
.pf_v8.pf_telemetry > p { margin-top: 10px; color: var(--ink2); font-size: 13px; line-height: 1.7; }
.pf_v8.pf_telemetry .pf_telemetry_state { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.pf_v8.pf_telemetry .pf_btn { display: inline-flex; align-items: center; min-height: 36px; padding: 0 16px; border: 1px solid var(--line2); border-radius: 18px; color: var(--ink); background: transparent; font-size: 13.5px; }
.pf_v8.pf_telemetry .pf_btn.pf_text { min-height: 0; padding: 0; border: 0; border-bottom: 1px solid var(--line2); border-radius: 0; font-size: 13px; }
.pf_v8.pf_telemetry .pf_small { color: var(--ink3); }
/* 历史页里的编辑草稿：本地时间、胶囊「恢复草稿」、文字链接「移除这份输入」。 */
.pf_v8 .pf8_drafts { margin-top: 40px; }
.pf_v8 .pf8_drafts .pf_featured_draft_list { list-style: none; margin: 16px 0 0; padding: 0; }
.pf_v8 .pf8_drafts .pf_featured_draft { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 13px 0; border-top: 0; border-bottom: 1px solid var(--line); }
.pf_v8 .pf8_drafts .pf_featured_draft:last-child { border-bottom: 0; }
.pf_v8 .pf8_drafts .pf_featured_draft_title { font-size: 14.5px; color: var(--ink); overflow-wrap: anywhere; }
.pf_v8 .pf8_drafts .pf_featured_draft_actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.pf_v8 .pf8_drafts .pf8_btn { display: inline-flex; align-items: center; height: 36px; padding: 0 16px; border: 1px solid var(--line2); border-radius: 18px; color: var(--ink); background: transparent; font-size: 13.5px; }
.pf_v8 .pf8_drafts .pf8_lk { padding: 0; border: 0; border-bottom: 1px solid var(--line2); border-radius: 0; color: var(--ink2); background: none; font-size: 13px; }
.pf_root.pf_v2 .pf_footer { max-width: 1080px; margin: 0 auto; padding: 0 40px 56px; border-top: 0; }
.pf_root.pf_v2 .pf_footer .pf_details { border-top: 0; }
.pf_root.pf_v2 .pf_footer .pf_details > summary { font-size: 13px; color: var(--ink3); }
.pf_root.pf_v2 .pf_footer .pf_details > summary { list-style: none; cursor: pointer; }
.pf_root.pf_v2 .pf_footer .pf_details > summary::-webkit-details-marker { display: none; }
.pf_root.pf_v2 .pf_footer .pf_details > summary::before { content: ""; display: inline-block; width: 0; height: 0; margin-right: 7px; vertical-align: 1px; border-left: 5px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent; }
.pf_root.pf_v2 .pf_footer .pf_details[open] > summary::before { vertical-align: 0; border-left: 0; border-top: 5px solid currentColor; border-right: 4px solid transparent; border-bottom: 0; border-left: 4px solid transparent; }
.pf_v8.pf8_flowback { width: calc(100% - 80px); max-width: 840px; margin: 0 auto 12px; }
@container finder (max-width: 700px) { .pf_v8.pf8_flowback { width: calc(100% - 32px); } }
@container finder (max-width: 700px) { .pf_v8 .pf8_oppcard { max-width: none; } }
/* 历史页草稿小标题：和首页区块标题同档，数量紧随、三级墨色。 */
.pf_v8 .pf8_drafts .pf8_draft_head { display: flex; flex-flow: row wrap; justify-content: flex-start; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.pf_v8 .pf8_drafts .pf8_draft_head h2 { font-size: 14px; font-weight: 600; }
.pf_v8 .pf8_drafts .pf8_draft_head .pf_small { margin: 0; font-size: 13px; color: var(--ink3); }
@container finder (max-width: 700px) { .pf_root.pf_v2 .pf_footer { padding-inline: 16px; } }

/* —— 我交代过的事整页（SPEC 5.12） —— */
.pf_v8 .pf8_histpage { min-height: 100%; }
.pf_v8 .pf8_histwrap { max-width: 920px; }
.pf_v8 .pf8_histhead { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.pf_v8 .pf8_histtitle { font: 400 clamp(26px, 4.6cqw, 37px)/1.5 var(--serif); letter-spacing: .01em; }
.pf_v8 .pf8_histlede { margin-top: 12px; max-width: 36em; color: var(--ink2); font-size: 15.5px; line-height: 1.75; }
.pf_v8 .pf8_histlist { margin-top: 26px; border-top: 1px solid var(--line); }
.pf_v8 .pf8_histlist li { border-bottom: 1px solid var(--line); }
.pf_v8 .pf8_histlist li:last-child { border-bottom: 0; }
.pf_v8 .pf8_histrow { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 12px; width: 100%; text-align: left; padding: 13px 0; align-items: baseline; }
.pf_v8 .pf8_histlego { display: inline-flex; }
.pf_v8 .pf8_histrow b { display: block; font-weight: 500; font-size: 14.5px; overflow-wrap: anywhere; }
.pf_v8 .pf8_histrow small { display: block; margin-top: 2px; font-size: 13px; color: var(--ink3); }
.pf_v8 .pf8_histrow:hover b { text-decoration: underline; text-underline-offset: 4px; }
.pf_v8 .pf8_histempty { padding: 30px 0; border-top: 1px solid var(--line); }
.pf_v8 .pf8_histempty p { max-width: 44em; font-size: 14px; line-height: 1.75; color: var(--ink2); }
.pf_v8 .pf8_histempty .pf8_btn { margin-top: 16px; }

.pf_v8 .pf8_store_foot { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 18px; margin-top: 30px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--ink3); font-size: 12px; }
.pf_v8 .pf8_store_foot a { color: var(--ink3); text-decoration: underline; text-underline-offset: 2px; }

/* —— 插件详情 —— */
.pf_v8 .pf8_detail_wrap { max-width: 900px; padding-top: 32px; }
.pf_v8 .pf8_detail_back { display: inline-block; margin-bottom: 14px; }
.pf_v8 .pf8_detail_card { padding: 34px 38px 30px; border: 1px solid var(--line2); border-radius: 24px; background: var(--card); }
.pf_v8 .pf8_detail_kicker { margin-bottom: 10px; color: var(--ink3); font-size: 12.5px; }
.pf_v8 .pf8_detail_head h1 { font: 400 clamp(26px, 4cqw, 38px)/1.35 var(--serif); letter-spacing: .01em; }
.pf_v8 .pf8_detail_head h1.pf8_detail_long { font: 400 clamp(21px, 3.2cqw, 26px)/1.5 var(--serif); }
.pf_v8 .pf8_detail_lead { margin-top: 12px; max-width: 720px; color: var(--ink2); font-size: 15px; line-height: 1.75; }
.pf_v8 .pf8_detail_block { margin-top: 22px; padding: 16px 20px; border: 0; border-left: 2.5px solid var(--have); border-radius: 0 12px 12px 0; background: color-mix(in srgb, var(--have) 7%, var(--card)); }
.pf_v8 .pf8_detail_block code { font: 15px/1.6 var(--mono); overflow-wrap: anywhere; }
.pf_v8 .pf8_detail_block p { margin-top: 5px; color: var(--ink2); font-size: 12.5px; }
.pf_v8 .pf8_detail_install { margin-top: 26px; }
.pf_v8 .pf8_detail_actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pf_v8 .pf8_detail_source { margin-left: auto; color: var(--ink3); font-size: 13px; border-bottom: 1px solid var(--line2); line-height: 1.8; }
.pf_v8 .pf8_detail_source:hover { color: var(--ink); }
.pf_v8 .pf8_detail_note { margin-top: 10px; color: var(--ink3); font-size: 12.5px; line-height: 1.7; }
.pf_v8 .pf8_detail_section { margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--line); }
.pf_v8 .pf8_detail_section h2 { margin-bottom: 6px; font-size: 13px; font-weight: 600; }
.pf_v8 .pf8_detail_facts { display: block; }
.pf_v8 .pf8_factlist { margin: 4px 0 0; }
.pf_v8 .pf8_fact { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 18px; padding: 12px 0; border-top: 1px solid var(--line); }
.pf_v8 .pf8_fact:first-child { border-top: 0; padding-top: 0; }
.pf_v8 .pf8_fact dt { color: var(--ink3); font-size: 12.5px; line-height: 1.75; }
.pf_v8 .pf8_fact dd { margin: 0; min-width: 0; color: var(--ink2); font-size: 14px; line-height: 1.75; overflow-wrap: anywhere; }
.pf_v8 .pf8_detail_list { padding-left: 18px; list-style: disc; }
.pf_v8 .pf8_detail_list li { margin-top: 3px; }
@container finder (max-width: 700px) {
  .pf_v8 .pf8_detail_card { padding: 22px 18px 20px; border-radius: 20px; }
  .pf_v8 .pf8_detail_fact { gap: 0; }
  .pf_v8 .pf8_fact { grid-template-columns: minmax(0, 1fr); gap: 3px; }
  .pf_v8 .pf8_detail_source { margin-left: 0; }
  .pf_v8 .pf8_detail_lead { font-size: 14px; }
}

/* —— 解法卡（SPEC 5.8） —— */
.pf_v8 .pf8_findpage { min-height: 100%; }
.pf_v8 .pf8_narrow { max-width: 860px; }
.pf_v8 .pf8_topmeta { margin-left: 4px; font-size: 12px; color: var(--ink3); white-space: nowrap; }
.pf_v8 .pf8_prev { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; font-size: 13px; color: var(--ink3); }
.pf_v8 .pf8_body { min-width: 0; }
.pf_v8 .pf8_card { background: var(--card); border: 1px solid var(--line2); border-radius: 24px; padding: 36px 40px 28px; }
.pf_v8 .pf8_card.pf8_warn { border-color: var(--build); }
.pf_v8 .pf8_card.pf8_revise { margin-top: 26px; padding: 26px 30px 22px; }
.pf_v8 .pf8_card.pf8_clarify { border-radius: 20px; padding: 26px 28px 22px; margin-top: 22px; }
.pf_v8 .pf8_q { margin-bottom: 14px; font-size: 13.5px; line-height: 1.7; color: var(--ink3); }
.pf_v8 .pf8_q b { font-weight: 400; color: var(--ink2); }
.pf_v8 .pf8_under { margin-top: -6px; }
.pf_v8 .pf8_verdict { display: block; font: 400 clamp(26px, 4.6cqw, 37px)/1.5 var(--serif); letter-spacing: .01em; text-wrap: pretty; }
.pf_v8 .pf8_verdict .pf8_pc { --h: .82em; margin: 0 .1em 0 -.02em; }
.pf_v8 .pf8_verdict_sm { font: 400 clamp(21px, 3cqw, 25px)/1.5 var(--serif); text-wrap: balance; }
.pf_v8 .pf8_why { margin-top: 12px; max-width: 36em; font-size: 15.5px; line-height: 1.75; color: var(--ink2); }
.pf_v8 .pf8_card_mini { border-radius: 20px; padding: 24px; }
.pf_v8 .pf8_card_mini .pf8_verdict { font-size: clamp(21px, 3.2cqw, 26px); }
.pf_v8 .pf8_card_mini .pf8_fit { margin-top: 18px; }

/* 拼出来的那一排：整行包在 @container bricks 内，全宽 code 在状态徽标下一行完整展示，不断词。 */
.pf_v8 .pf8_fit_wrap { margin-top: 28px; container-type: inline-size; container-name: bricks; }
.pf_v8 .pf8_card_mini .pf8_fit_wrap, .pf_v8 .pf8_tentative .pf8_fit_wrap { margin-top: 18px; }
.pf_v8 .pf8_fit { display: flex; align-items: stretch; gap: 0; margin-top: 0; }
.pf_v8 .pf8_blk { position: relative; flex: 1 1 0; min-width: 0; padding: 14px 18px; border-radius: 16px; border: 1.3px solid transparent; display: flex; flex-direction: column; gap: 4px; }
.pf_v8 .pf8_blk_top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.pf_v8 .pf8_blk_studs { display: inline-flex; gap: 5px; align-items: center; flex: none; }
.pf_v8 .pf8_blk_studs i { display: block; width: 9px; height: 4px; border-radius: 2px 2px 0 0; }
.pf_v8 .pf8_blk.have .pf8_blk_studs i { background: var(--have); opacity: .75; }
.pf_v8 .pf8_blk.build .pf8_blk_studs i { border: 1px dashed var(--build); background: transparent; height: 5px; }
.pf_v8 .pf8_blk.native .pf8_blk_studs i { background: var(--line2); }
.pf_v8 .pf8_bstat { font-size: 11px; line-height: 1.3; font-weight: 500; white-space: nowrap; color: var(--ink3); }
.pf_v8 .pf8_blk.have .pf8_bstat { color: color-mix(in srgb, var(--have) 88%, var(--ink)); }
.pf_v8 .pf8_blk.build .pf8_bstat { color: color-mix(in srgb, var(--build) 78%, var(--ink)); }
.pf_v8 .pf8_blk code { display: block; width: 100%; font: 600 13.5px/1.45 var(--mono); word-break: keep-all; overflow-wrap: break-word; }
.pf_v8 .pf8_blk code .pf8_pc { --h: 19px; margin: -3px 5px -3px -3px; vertical-align: -3px; }
.pf_v8 .pf8_blk span { display: block; margin-top: 2px; font-size: 13px; line-height: 1.5; color: var(--ink2); }
.pf_v8 .pf8_blk .pf8_blk_ver { color: var(--ink3); font-size: 12px; font-variant-numeric: tabular-nums; }
.pf_v8 .pf8_blk em { display: block; margin-top: auto; padding-top: 4px; font-style: normal; font-size: 11.5px; color: var(--ink2); }
.pf_v8 .pf8_conn { display: flex; align-items: center; justify-content: center; flex: none; width: 22px; font: 600 15px/1 var(--sans); color: var(--ink4); user-select: none; }
.pf_v8 .pf8_blk.have { background: color-mix(in srgb, var(--have) 9%, transparent); border-color: color-mix(in srgb, var(--have) 55%, transparent); }
.pf_v8 .pf8_blk.build { background: color-mix(in srgb, var(--build) 8%, transparent); border: 1.3px dashed var(--build); }
.pf_v8 .pf8_blk.build code { font-family: var(--sans); color: color-mix(in srgb, var(--build) 78%, var(--ink)); }
.pf_v8 .pf8_blk.native { border-color: var(--line2); }

.pf_v8 .pf8_sub { margin-top: 26px; font-size: 13px; font-weight: 600; color: var(--ink2); }
.pf_v8 .pf8_rej li { display: grid; grid-template-columns: 22px minmax(0, 170px) minmax(0, 1fr); gap: 10px; align-items: baseline; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.pf_v8 .pf8_rej li:last-child { border-bottom: 0; }
.pf_v8 .pf8_rej .pf8_pc { --h: 20px; margin: -3px; }
.pf_v8 .pf8_rej code { font: 13px var(--mono); color: var(--ink2); overflow-wrap: anywhere; }
.pf_v8 .pf8_rej span { color: var(--ink3); }
.pf_v8 .pf8_acts { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 26px; }
.pf_v8 .pf8_card .pf8_acts .pf8_btn { text-decoration: none; }
.pf_v8 .pf8_next { margin-top: 10px; font-size: 13px; color: var(--ink3); }
.pf_v8 .pf8_prev_note { margin-top: 18px; }
.pf_v8 .pf8_sign { display: flex; align-items: center; gap: 8px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 12.5px; color: var(--ink3); }
.pf_v8 .pf8_sign .pf8_pc { --h: 20px; margin: -3px; }

/* 卡片下面三块 */
.pf_v8 .pf8_after { margin-top: 40px; }
.pf_v8 .pf8_after h2 { margin-bottom: 10px; font-size: 14px; font-weight: 600; }
.pf_v8 .pf8_steps { counter-reset: pf8s; }
.pf_v8 .pf8_steps li { counter-increment: pf8s; display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 12px; padding: 7px 0; font-size: 15px; line-height: 1.7; }
.pf_v8 .pf8_steps li::before { content: counter(pf8s); width: 24px; height: 24px; margin-top: 2px; border: 1px solid var(--line2); border-radius: 50%; display: grid; place-items: center; font-size: 12px; color: var(--ink3); }
.pf_v8 .pf8_steps b { font-weight: 500; }
.pf_v8 .pf8_steps small { display: block; font-size: 12.5px; line-height: 1.6; color: var(--ink3); }
.pf_v8 .pf8_step_say { color: var(--ink2); }
.pf_v8 .pf8_know { border-left: 2px solid var(--build); padding: 2px 0 2px 16px; font-size: 14.5px; line-height: 1.7; color: var(--ink2); }
.pf_v8 .pf8_know p + p { margin-top: 4px; }
.pf_v8 .pf8_caps { margin-top: 22px; }
.pf_v8 .pf8_folds { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 30px; }
.pf_v8 .pf8_folds .pfv_disclosure { margin-top: 0; border-top: 0; }
.pf_v8 .pf8_folds .pfv_disclosure > summary { padding: 0; min-height: 0; font-size: 13px; color: var(--ink3); }
.pf_v8 .pf8_folds .pfv_disclosure > summary:hover { color: var(--ink); }
.pf_v8 .pf8_folds .pfv_disclosure > .pfv_disclosure_body { padding: 10px 0 0; }
.pf_v8 .pf8_revise_head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.pf_v8 .pf8_revise_head h2 { font: 400 20px/1.4 var(--serif); }
.pf_v8 .pf8_revise .pfv_composer { margin-top: 8px; border: 0; border-top: 1px solid var(--line); border-radius: 0; padding: 14px 0 0; background: transparent; }
.pf_v8 .pf8_revise .pfv_composer:focus-within { border-color: var(--line); box-shadow: none; }
.pf_v8 .pf8_revise .pfv_composer textarea { min-height: 62px; }
.pf_v8 .pf8_revise .pfv_expert { margin-top: 8px; border: 0; border-top: 1px solid var(--line); border-radius: 0; padding: 14px 0 0; background: transparent; }

/* 正在找 / 没查完 */
.pf_v8 .pf8_find .pf8_log { margin-top: 22px; }
.pf_v8 .pf8_log li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; align-items: baseline; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14.5px; line-height: 1.65; color: var(--ink2); }
.pf_v8 .pf8_log li:last-child { border-bottom: 0; }
.pf_v8 .pf8_log .pf8_pc { --h: 20px; margin: -3px; }
.pf_v8 .pf8_log .pf8_dot { display: block; width: 7px; height: 7px; margin: 7px 0 0 6px; border-radius: 50%; background: var(--build); }
.pf_v8 .pf8_log .pf8_dot_done { background: var(--line2); }
.pf_v8 .pf8_log .pf8_cur { color: var(--ink); }
/* 折叠入口：和 v3 的折叠区一样带一个可见的展开标记，不靠颜色。 */
.pf_v8 .pf8_disclosure > summary { display: block; cursor: pointer; list-style: none; font-size: 13px; color: var(--ink3); border-bottom: 0; }
.pf_v8 .pf8_disclosure > summary::-webkit-details-marker { display: none; }
.pf_v8 .pf8_disclosure > summary::before { content: ""; display: inline-block; width: 0; height: 0; margin-right: 7px; vertical-align: 1px; border-left: 5px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent; }
.pf_v8 .pf8_disclosure[open] > summary::before { vertical-align: 0; border-left: 0; border-top: 5px solid currentColor; border-right: 4px solid transparent; border-bottom: 0; border-left: 4px solid transparent; }
.pf_v8 .pf8_folds .pfv_disclosure > summary { list-style: none; }
.pf_v8 .pf8_folds .pfv_disclosure > summary::-webkit-details-marker { display: none; }
.pf_v8 .pf8_folds .pfv_disclosure > summary::before { content: ""; display: inline-block; width: 0; height: 0; margin-right: 7px; vertical-align: 1px; border-left: 5px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent; }
.pf_v8 .pf8_folds .pfv_disclosure[open] > summary::before { vertical-align: 0; border-left: 0; border-top: 5px solid currentColor; border-right: 4px solid transparent; border-bottom: 0; border-left: 4px solid transparent; }
/* 商店是整页，不继承首页那一块的上边线和外边距。 */
.pf8_store.pfv_community { margin-top: 0; padding-top: 0; border-top: 0; }
.pf_v8 .pf8_disclosure > summary:hover { color: var(--ink); }
.pf_v8 .pf8_warn_note { margin-bottom: 16px; padding: 13px 16px; border-left: 2px solid var(--build); background: color-mix(in srgb, var(--build) 6%, var(--card)); border-radius: 0 12px 12px 0; }
.pf_v8 .pf8_warn_note p { font-size: 13px; line-height: 1.7; color: var(--ink2); }
.pf_v8 .pf8_warn_note .pf8_fine { margin-top: 4px; color: var(--ink3); }
.pf_v8 .pf8_src { margin-top: 6px; }
.pf_v8 .pf8_src li { display: grid; grid-template-columns: 22px minmax(0, 200px) minmax(0, 1fr); gap: 10px; align-items: baseline; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.pf_v8 .pf8_src li:last-child { border-bottom: 0; }
.pf_v8 .pf8_src .pf8_pc { --h: 20px; margin: -3px; }
.pf_v8 .pf8_src code { font: 13px var(--mono); color: var(--ink2); overflow-wrap: anywhere; }
.pf_v8 .pf8_src span { color: var(--ink2); }
.pf_v8 .pf8_src .pf8_near span { color: var(--ink2); }
.pf_v8 .pf8_pills { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.pf_v8 .pf8_pills .pf8_pill { height: 34px; padding: 0 16px; border-radius: 17px; border-color: var(--line2); font-size: 13.5px; }
.pf_v8 .pf8_pills .pf8_pill[aria-pressed="true"] { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.pf_v8 .pfv_creation_summary dd, .pf_v8 .pf8_card .pf8_why { overflow-wrap: anywhere; }

@container finder (max-width: 700px) {
  .pf_v8 .pf8_card { padding: 24px 20px 20px; border-radius: 20px; }
  .pf_v8 .pf8_card.pf8_revise { padding: 20px 18px 16px; }
  .pf_v8 .pf8_fit_wrap { margin-top: 22px; }
  .pf_v8 .pf8_rej li { grid-template-columns: 22px minmax(0, 1fr); }
  .pf_v8 .pf8_rej span { grid-column: 2; }
  .pf_v8 .pf8_src li { grid-template-columns: 22px minmax(0, 1fr); }
  .pf_v8 .pf8_src span { grid-column: 2; }
  .pf_v8 .pf8_folds { gap: 14px; }
}
@container finder (max-width: 560px) {
  .pf_v8 .pf8_top { flex-wrap: wrap; gap: 8px 10px; }
  .pf_v8 .pf8_top nav { margin-left: 0; }
  .pf_v8 .pf8_verdict { font-size: clamp(23px, 7cqw, 30px); }
  .pf_v8 .pf8_acts .pf8_btn { width: 100%; justify-content: center; }
  .pf_v8 .pf8_bp_row { grid-template-columns: minmax(0, 1fr); gap: 2px; }
}
@container bricks (max-width: 520px) {
  .pf_v8 .pf8_fit { flex-direction: column; gap: 6px; }
  .pf_v8 .pf8_conn { width: auto; height: 14px; font-size: 13px; }
  .pf_v8 .pf8_blk { flex: none; min-width: 0; }
}

/* —— v9.2 统一视觉牵引：漏斗、演化卡、商店占比、详情快速核对、扁平单层、原生弹窗 —— */
.pf_v8 .pf8_tentative { margin-top: 14px; padding: 14px 16px; border: 0; border-left: 2px solid var(--line2); border-radius: 0 12px 12px 0; background: var(--subtle); }
.pf_v8 .pf8_tentative .pf8_verdict { font-size: clamp(19px, 3cqw, 23px); }
.pf_v8 .pf8_funnel { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 20px; padding: 10px 14px; border-radius: 12px; background: var(--subtle); font-size: 12.5px; color: var(--ink2); }
.pf_v8 .pf8_fstep { display: inline-flex; align-items: baseline; gap: 5px; white-space: nowrap; }
.pf_v8 .pf8_fstep b { font: 600 12.5px/1.2 var(--sans); font-variant-numeric: tabular-nums; color: var(--ink); }
.pf_v8 .pf8_fstep[data-kind="selected"] b { color: color-mix(in srgb, var(--have) 88%, var(--ink)); }
.pf_v8 .pf8_fstep[data-kind="warn"] b { color: color-mix(in srgb, var(--build) 78%, var(--ink)); }
.pf_v8 .pf8_fsep { color: var(--ink4); font-size: 12px; }
.pf_v8 .pf8_evo_bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 22px; padding: 10px 14px; border-left: 2.5px solid var(--build); border-radius: 0 12px 12px 0; background: color-mix(in srgb, var(--build) 7%, var(--card)); font-size: 13px; color: var(--ink2); }
.pf_v8 .pf8_evo_pill { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--build) 16%, transparent); color: color-mix(in srgb, var(--build) 78%, var(--ink)); font-size: 11.5px; font-weight: 600; white-space: nowrap; }
.pf_v8 .pf8_blueprint { margin-top: 12px; padding: 14px 16px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); display: grid; gap: 8px; }
.pf_v8 .pf8_bp_row { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 12px; align-items: baseline; font-size: 13px; line-height: 1.65; }
.pf_v8 .pf8_bp_row dt { color: var(--ink3); font-size: 12px; }
.pf_v8 .pf8_bp_row dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
.pf_v8 .pf8_store_shares { margin-top: 18px; display: grid; gap: 7px; max-width: 520px; }
.pf_v8 .pf8_store_srow { display: grid; grid-template-columns: minmax(76px, auto) minmax(0, 1fr) auto; align-items: center; gap: 10px; font-size: 12px; color: var(--ink3); }
.pf_v8 .pf8_store_sbar { height: 6px; border-radius: 999px; background: var(--line); overflow: hidden; }
.pf_v8 .pf8_store_sfill { display: block; height: 100%; border-radius: inherit; background: color-mix(in srgb, var(--have) 62%, transparent); }
.pf_v8 .pf8_store_scnt { font-variant-numeric: tabular-nums; white-space: nowrap; }
.pf_v8 .pf8_fit_inline { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 12px; }
.pf_v8 .pf8_fit_inline > summary { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; cursor: pointer; list-style: none; font-size: 13px; color: var(--ink2); }
.pf_v8 .pf8_fit_inline > summary::-webkit-details-marker { display: none; }
.pf_v8 .pf8_fit_inline > summary::before { content: ""; display: inline-block; width: 0; height: 0; border-left: 5px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent; }
.pf_v8 .pf8_fit_inline[open] > summary::before { vertical-align: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid currentColor; border-bottom: 0; }
.pf_v8 .pf8_fit_badge { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 999px; font-size: 11.5px; font-weight: 500; background: var(--subtle); color: var(--ink2); }
.pf_v8 .pf8_fit_badge[data-tone="ok"] { color: var(--ok); background: color-mix(in srgb, var(--ok) 12%, transparent); }
.pf_v8 .pf8_fit_badge[data-tone="warn"] { color: color-mix(in srgb, var(--build) 78%, var(--ink)); background: color-mix(in srgb, var(--build) 12%, transparent); }
.pf_v8 .pf8_fit_grid { margin-top: 12px; }
.pf_v8 .pfv_plugin_error { margin-top: 18px; padding: 12px 16px; border: 0; border-left: 2.5px solid var(--err); border-radius: 0 12px 12px 0; background: color-mix(in srgb, var(--err) 7%, var(--card)); font-size: 13.5px; }
.pf_v8 .pf8_folds :is(.pf_coverage, .pf_task_history, .pf_candidate, .pf_install) { border: 0; border-top: 1px solid var(--line); border-radius: 0; padding: 14px 0; margin: 10px 0 0; background: transparent; box-shadow: none; }
.pf_modal_head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.pf_modal_head h2 { margin: 0; font: 400 22px/1.4 var(--serif); color: var(--ink); }
.pf_modal_x { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--line); color: var(--ink2); display: inline-flex; align-items: center; justify-content: center; flex: none; }
.pf_modal_x:hover:not(:disabled) { background: var(--hover); color: var(--ink); }
.pf_modal_body { margin-top: 10px; font-size: 14px; line-height: 1.7; color: var(--ink2); }
.pf_modal_facts { margin: 14px 0 0; padding: 12px 14px; border-radius: 12px; background: var(--subtle); display: grid; gap: 6px; font-size: 13px; }
.pf_modal_facts > div { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 10px; }
.pf_modal_facts dt { color: var(--ink3); }
.pf_modal_facts dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
.pf_modal_ws { margin-top: 14px; display: grid; gap: 6px; font-size: 13px; color: var(--ink2); }
.pf_modal_ws select { width: 100%; height: 38px; padding: 0 12px; border: 1px solid var(--line2); border-radius: 10px; background: var(--bg); color: var(--ink); font: inherit; }
.pf_modal_acts { margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }

`;
