/** Finder-owned V2 layer. Host aliases supply both light and dark colors. */
export const experienceCss = `
.pf_root.pf_v2 {
  container-type: inline-size;
  container-name: finder;
  --pfv_canvas: var(--dsw-alias-bg-layer-1, #f5f7fc);
  --pfv_paper: var(--dsw-alias-bg-base, #fff);
  --pfv_ink: var(--dsw-alias-label-primary, #18263b);
  --pfv_muted: var(--dsw-alias-label-secondary, #606b78);
  --pfv_line: var(--dsw-alias-border-l3, #dce4ed);
  --pfv_strong_line: var(--dsw-alias-border-l2, #becbdb);
  --pfv_accent: var(--dsw-alias-state-business-primary, #4d6bfe);
  --pfv_on_accent: var(--dsw-alias-label-on-primary, #fff);
  --pfv_tint: color-mix(in srgb, var(--pfv_accent) 8%, var(--pfv_paper));
  background: var(--pfv_canvas);
  color: var(--pfv_ink);
  font-size: 15px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}
.pf_v2 [hidden] { display: none !important; }
.pf_execution_original_conversation { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.pf_execution_conversation:has(.pf_execution_file_preview) .pf_execution_original_conversation { display: none !important; }
.pf_v2 .pf_inner { max-width: 1260px; padding: 26px 40px 42px; }
.pf_v2 .pf_header { margin-bottom: 36px; padding-bottom: 18px; border-bottom: 1px solid var(--pfv_line); min-height: 54px; }
.pf_v2 .pf_header > .pf_btn { font-size: 17px; font-weight: 650; letter-spacing: -.3px; color: var(--pfv_ink); padding-left: 0; }
.pf_v2 .pf_header_actions { padding-right: 62px; }
.pf_v2 .pf_header .pf_options { top: 0; }
.pf_v2 .pf_btn, .pf_v2 summary { min-height: 44px; }
.pf_v2 .pf_btn { border-radius: 9px; }
.pf_v2 .pf_small, .pf_v2 .pf_details summary { font-size: 13px; }
.pf_v2 .pf_muted { color: var(--pfv_muted); }
.pf_v2 .pf_header .pf_options > summary { min-height: 44px; padding-top: 10px; }
.pf_v2 .pf_header .pf_options[open] { background: var(--pfv_paper); border-radius: 12px; }
.pf_v2 .pf_flow_back { display: none; }
.pf_v2 .pf_footer { font-size: 12px; line-height: 1.8; color: var(--pfv_muted); margin-top: 36px; border-color: var(--pfv_line); }
.pf_v2 .pf_status { border-radius: 10px; margin-bottom: 18px; }
.pf_v2 .pf_telemetry { background: var(--pfv_paper); border-color: var(--pfv_line); }
.pfv_home, .pfv_workspace, .pfv_creation_guide { min-width: 0; }
.pf_root.pf_v2:has(.pfv_home) { background: var(--pfv_canvas); }
.pf_v2:has(.pfv_home) .pf_header { margin-bottom: 20px; border-bottom: 0; padding-bottom: 0; }
.pfv_home { max-width: 1120px; margin: 0 auto; }
.pfv_home_start { display: block; padding: 24px 0 44px; }
.pfv_home_intro, .pfv_home_scenario { display: block; grid-column: 1; grid-row: auto; min-width: 0; padding: 0; margin: 0; }
.pfv_home_scenario { border-top: 1px solid var(--pfv_line); padding-top: 18px; }
.pfv_home_scenario .pfv_home_heading { font-size: 14px; margin: 0 0 4px; }
.pfv_home_scenario .pfv_home_lead { margin: 0 0 10px; font-size: 13px; }
.pfv_home_scenario .pfv_scenario_card { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; }
.pfv_home_scenario .pfv_scenario_card h3 { margin: 0; font-size: 15px; }
.pfv_home_scenario .pfv_scenario_card > p { margin: 0; flex: 1 1 auto; min-width: 0; }
.pfv_home_scenario .pfv_composer_bottom { flex: none; margin: 0; }
.pfv_home_extras { min-width: 0; margin-top: 18px; padding-bottom: 4px; }
.pfv_opportunity_column { grid-column: 1; grid-row: auto; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.pfv_opportunity .pfv_home_lead, .pfv_opportunity .pfv_scenario_reason { display: none; }
.pfv_opportunity .pfv_home_heading { font-size: 12px; font-weight: 500; color: var(--pfv_muted); margin: 0; }
.pfv_opportunity .pfv_scenario_card { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 14px; border-radius: 10px; }
.pfv_opportunity .pfv_scenario_card h3 { margin: 0; font-size: 13px; }
.pfv_opportunity .pfv_scenario_card > p { margin: 0; font-size: 12.5px; color: var(--pfv_muted); flex: 1 1 240px; }
.pfv_opportunity .pfv_scenario_card .pfv_composer_bottom { margin: 0 0 0 auto; }
.pf_v2 .pfv_opportunity .pfv_home_card { min-height: 0; padding: 10px 14px; border-radius: 10px; flex-direction: row; align-items: center; gap: 14px; }
.pf_v2 .pfv_opportunity .pfv_scenario_card h3 { font-size: 13px; }
.pf_v2 .pfv_opportunity .pfv_scenario_card .pfv_prose { font-size: 12.5px; line-height: 1.6; margin: 0; }
.pf_v2 .pfv_opportunity .pfv_home_card .pfv_composer_bottom { padding-top: 0; }
.pf_v2 .pfv_home_heading { margin: 0; font-size: 32px; line-height: 1.35; letter-spacing: -.8px; font-weight: 650; }
.pf_v2 .pfv_home_lead { font-size: 14px; color: var(--pfv_muted); margin: 8px 0 22px; line-height: 1.75; }
.pf_v2 .pfv_scenario_card h3 { margin: 0; font-size: 20px; line-height: 1.55; letter-spacing: -.3px; font-weight: 600; text-wrap: balance; }
.pf_v2 .pfv_scenario_card .pfv_prose { font-size: 14px; line-height: 1.85; margin-top: 10px; color: var(--pfv_muted); }
.pfv_scenario_reason { font-size: 12px; color: var(--pfv_accent); margin-top: 12px !important; }
.pf_v2 .pfv_home_scenario .pfv_scenario_start { border-color: var(--pfv_strong_line); background: var(--pfv_paper); color: var(--pfv_accent); }
.pf_v2 .pfv_home_scenario .pfv_scenario_start:hover:not(:disabled) { background: var(--pfv_tint); border-color: var(--pfv_accent); }
.pfv_composer { border: 1px solid var(--pfv_strong_line); border-radius: 20px; background: var(--pfv_paper); padding: 18px 20px 16px; transition: border-color 160ms ease, box-shadow 160ms ease; }
.pfv_composer:focus-within { border-color: var(--pfv_accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pfv_accent) 11%, transparent); }
.pfv_expert { margin-top: 18px; border: 1px solid var(--pfv_strong_line); border-radius: 20px; background: var(--pfv_paper); padding: 16px 18px 12px; display: flex; flex-direction: column; gap: 10px; }
.pfv_expert_heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; }
.pfv_expert_heading h3 { margin: 0; font-size: 16px; }
.pfv_expert .pf_expert_conversation { border-top: 1px solid var(--pfv_line); padding-top: 8px; }
.pfv_expert_error { color: var(--pfv_danger, #c2410c); }
.pfv_expert_plan { border: 1px solid color-mix(in srgb, var(--pfv_accent) 38%, var(--pfv_line)); border-radius: 16px; background: color-mix(in srgb, var(--pfv_accent) 5%, var(--pfv_paper)); padding: 14px 16px; margin: 0 0 18px; }
.pfv_expert_plan_heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.pfv_expert_plan h3 { margin: 8px 0 4px; font-size: 17px; }
.pfv_expert_plugins, .pfv_expert_steps { margin: 8px 0; padding-left: 20px; line-height: 1.7; }
.pfv_home_card { display: flex; flex-direction: column; min-width: 0; min-height: 208px; margin: 0; padding: 22px 24px 20px; border: 1px solid var(--pfv_strong_line); border-radius: 16px; }
.pfv_home_composer { background: var(--pfv_paper); box-shadow: 0 4px 18px color-mix(in srgb, var(--pfv_ink) 4%, transparent); }
.pfv_scenario_card { background: color-mix(in srgb, var(--pfv_accent) 6%, var(--pfv_paper)); border-color: color-mix(in srgb, var(--pfv_accent) 10%, var(--pfv_line)); }
.pfv_home_card .pfv_composer_bottom { justify-content: flex-end; margin-top: auto; padding-top: 18px; flex: none; }
.pf_v2 .pfv_home_card .pfv_composer_bottom > .pfv_button { box-sizing: border-box; width: 132px; height: 44px; min-height: 44px; flex: none; margin: 0; padding: 8px 14px; }
.pfv_home_selection { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--pfv_line); color: var(--pfv_muted); font-size: 13px; line-height: 1.7; }
.pfv_home_selection > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.pfv_home_selection > .pfv_button { flex: none; margin-left: auto; padding-inline: 8px; font-size: 13px; }
.pf_v2 .pfv_composer textarea { display: block; width: 100%; min-height: 103px; padding: 1px 0 10px; border: 0; box-shadow: none; outline: none; resize: vertical; border-radius: 0; background: transparent; color: var(--pfv_ink); font: inherit; line-height: 1.8; }
.pf_v2 .pfv_home_composer textarea { flex: 1 1 auto; min-height: 84px; font-size: 16px; }
.pf_v2 .pfv_composer textarea::placeholder, .pfv_field textarea::placeholder { color: var(--pfv_muted); opacity: .85; }
.pf_v2 .pfv_composer textarea:focus { box-shadow: none; outline: none; border: 0; }
.pfv_composer_bottom { display: flex; gap: 16px; justify-content: space-between; align-items: center; }
.pfv_hint { color: var(--pfv_muted); font-size: 13px; line-height: 1.7; }
.pfv_button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 9px 15px; gap: 8px; border: 1px solid var(--pfv_line); border-radius: 9px; background: var(--pfv_paper); color: var(--pfv_ink); font: inherit; font-size: 14px; line-height: 1.5; font-weight: 550; text-align: center; cursor: pointer; transition: background 140ms ease, border-color 140ms ease; overflow-wrap: anywhere; }
.pfv_button:hover:not(:disabled) { border-color: var(--pfv_strong_line); background: var(--pfv_canvas); }
.pfv_button:disabled { opacity: .5; cursor: not-allowed; }
.pfv_primary { border-color: var(--pfv_accent); background: var(--pfv_accent); color: var(--pfv_on_accent); padding-inline: 20px; }
.pfv_primary:hover:not(:disabled) { border-color: var(--pfv_accent); background: color-mix(in srgb, var(--pfv_accent) 90%, var(--pfv_ink)); }
.pfv_quiet { background: transparent; border-color: transparent; color: var(--pfv_muted); }
.pfv_button:focus-visible, .pf_v2 summary:focus-visible, .pfv_mobile_jump:focus-visible, .pfv_field textarea:focus-visible, .pf_v2 .pf_btn:focus-visible { outline: 3px solid var(--pfv_accent); outline-offset: 3px; }
.pfv_examples { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; margin-top: 10px; }
.pfv_examples > .pfv_hint { margin-right: 4px; }
.pfv_store_jump { display: inline-flex; align-items: center; min-height: 44px; padding: 8px 0 8px 12px; margin-left: 8px; color: var(--pfv_accent); text-decoration: none; font-size: 13px; white-space: nowrap; }
.pfv_store_jump:hover { text-decoration: underline; text-underline-offset: 4px; }
.pfv_example { color: var(--pfv_muted); background: transparent; border: 0; font-size: 13px; padding-inline: 10px; font-weight: 450; }
.pfv_example:hover:not(:disabled) { color: var(--pfv_accent); background: var(--pfv_tint); }
.pfv_resume { display: flex; justify-content: flex-start; align-items: center; gap: 16px; padding: 12px 14px; margin: 0 0 18px; border: 1px solid var(--pfv_line); border-radius: 12px; background: var(--pfv_paper); }
.pfv_resume > div { min-width: 0; flex: 0 1 auto; }
.pfv_resume .pfv_prose { font-size: 14px; margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pfv_resume > .pfv_button { flex: none; }
.pf_v2 .pf_featured_home { margin-top: 0; padding-top: 34px; border-top: 1px solid var(--pfv_line); }
.pf_v2 .pf_featured_group > .pf_section_head { align-items: end; margin-bottom: 23px; }
.pf_v2 .pf_featured_group h2 { font-size: 22px; font-weight: 600; letter-spacing: -.35px; }
.pf_v2 .pfv_featured_intro { font-size: 14px; color: var(--pfv_muted); margin-top: 5px; }
.pf_v2 .pf_featured_grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; border: 0; border-radius: 0; overflow: visible; background: transparent; }
.pfv_featured_matches { display: contents; }
.pf_v2 .pf_featured_card { border: 0; border-radius: 12px; padding: 21px 20px 14px; background: var(--pfv_canvas); min-height: 0; }
.pf_v2 .pf_featured_card:nth-child(even) { border: 0; }
/* The recommendation wrapper is display:contents, so use the flattened
   collection's explicit grid borders instead of relying on DOM nth-child. */
.pf_v2 .pfv_featured_collection { gap: 20px; background: transparent; }
.pf_v2 .pfv_featured_collection .pf_featured_card { background: var(--pfv_canvas); border: 0; }
.pfv_featured_identity { display: flex; flex-direction: column; align-items: flex-start; gap: 15px; margin-bottom: 12px; }
.pfv_featured_icon { width: 34px; height: 34px; color: var(--pfv_ink); }
.pfv_featured_icon { display: block; flex: none; }
.pf_v2 .pfv_featured_name { font-size: 12px; color: var(--pfv_muted); margin-bottom: 9px; }
.pf_v2 .pf_featured_card h3 { font-size: 17px; line-height: 1.5; letter-spacing: -.2px; font-weight: 600; max-width: 24em; }
.pf_v2 .pf_featured_summary { font-size: 14px; line-height: 1.8; color: var(--pfv_muted); margin-top: 0 !important; max-width: 36em; }
.pf_v2 .pf_featured_reason { font-size: 12px; color: var(--pfv_accent); margin-top: 11px !important; }
.pf_v2 .pf_featured_card_actions { padding-top: 20px; margin-top: auto; gap: 6px; }
.pf_v2 .pf_featured_card_actions .pf_btn { min-height: 44px; font-size: 13px; padding-inline: 0; color: var(--pfv_accent); }
.pf_v2 .pf_featured_card_actions .pf_featured_status { color: var(--pfv_muted); font-size: 12px; padding: 0; border: 0; background: transparent; }
.pf_v2 .pf_featured_settings { margin-top: 13px; font-size: 13px; }
.pf_v2 .pf_featured_settings > summary { padding: 10px 0; }
.pf_v2 .pf_featured_settings .pf_btn { min-height: 44px; font-size: 13px; }
.pf_v2 .pf_featured_disclosure { font-size: 12px; margin-top: 3px !important; color: var(--pfv_muted); }
.pf_v2 .pf_featured_detail { max-width: 900px; margin: auto; }
.pf_v2 .pf_featured_detail .pf_section { background: var(--pfv_paper); border-color: var(--pfv_line); padding: 24px; }
.pf_v2 .pf_featured_detail h2 { font-size: 28px; }
.pf_v2 .pf_featured_detail h3 { font-size: 17px; }
.pf_v2 .pf_featured_detail .pf_featured_lead { font-size: 17px; }
.pfv_workspace_nav { display: flex; gap: 16px; align-items: center; margin: -14px 0 20px; }
.pfv_workspace_nav > .pfv_button { margin-left: -14px; }
.pfv_current_workspace { max-width: 1120px; margin: 0 auto; }
.pfv_request_summary { padding: 0 0 19px; margin-bottom: 6px; border-bottom: 1px solid var(--pfv_line); }
.pfv_request_summary > p { display: grid; grid-template-columns: 6.5em minmax(0, 1fr); align-items: baseline; gap: 12px; margin: 0; font-size: 14px; line-height: 1.75; }
.pfv_request_summary > p + p { margin-top: 5px; }
.pfv_request_summary > .pfv_disclosure { margin: 0 0 4px 103px; border: 0; }
.pfv_request_summary > .pfv_disclosure > summary { min-height: 26px; padding: 2px 0; font-size: 12px; color: var(--pfv_muted); }
.pfv_request_summary > .pfv_disclosure > .pfv_disclosure_body { padding: 7px 0 10px; }
.pfv_request_text, .pfv_understanding_text { min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.pfv_understanding_text { color: var(--pfv_muted); }
.pfv_current_workspace .pfv_column_heading { min-height: 42px; margin-bottom: 8px; }
.pfv_workspace_grid { display: grid; grid-template-columns: minmax(285px, .78fr) minmax(0, 1.22fr); gap: 28px; align-items: start; }
.pfv_column_heading { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; min-height: 48px; margin-bottom: 14px; }
.pf_v2 .pfv_column_heading h2 { font-size: 16px; font-weight: 600; letter-spacing: -.2px; }
.pfv_conversation { min-width: 0; position: sticky; top: 0; max-height: calc(100vh - 70px); display: flex; flex-direction: column; }
.pfv_messages { min-height: 100px; max-height: min(48vh, 580px); overflow-y: auto; overscroll-behavior: contain; padding-right: 8px; scrollbar-width: thin; }
.pfv_message { padding: 3px 0 22px; min-width: 0; }
.pfv_message + .pfv_message { padding-top: 18px; border-top: 1px solid var(--pfv_line); }
.pfv_message_meta { display: flex; justify-content: space-between; gap: 14px; font-size: 12px; color: var(--pfv_muted); margin-bottom: 8px; }
.pfv_message_meta > span:first-child { font-weight: 600; }
.pfv_message_user .pfv_prose { color: var(--pfv_ink); }
.pfv_message_assistant { padding-left: 14px; border-left: 2px solid var(--pfv_accent); }
.pf_v2 .pfv_prose { font-size: 15px; line-height: 1.85; white-space: pre-wrap; overflow-wrap: anywhere; max-width: 76ch; }
.pfv_conversation_bottom { padding-top: 12px; margin-top: auto; }
.pfv_followup { padding: 16px 19px; border-radius: 16px; margin-top: 18px; }
.pfv_composer_label { display: block; font-size: 13px; font-weight: 550; margin-bottom: 10px; }
.pf_v2 .pfv_followup textarea { min-height: 58px; font-size: 14px; }
.pfv_followup .pfv_composer_bottom { gap: 10px; align-items: end; }
.pfv_followup .pfv_hint { font-size: 12px; }
.pfv_followup .pfv_primary { flex: none; padding-inline: 14px; }
.pfv_progress { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--pfv_muted); margin: 0 0 10px; }
.pfv_progress > .pfv_button { margin-left: auto; padding-inline: 8px; }
.pfv_progress_dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pfv_accent); flex: none; animation: pfv_pulse 1.5s ease-in-out infinite; }
.pfv_outcome { min-width: 0; scroll-margin-top: 18px; }
.pfv_version { border: 1px solid var(--pfv_line); border-radius: 6px; padding: 3px 8px; color: var(--pfv_muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.pfv_outcome_document { border: 1px solid var(--pfv_line); border-radius: 18px; background: var(--pfv_paper); padding: 30px; box-shadow: 0 6px 20px color-mix(in srgb, var(--pfv_ink) 3%, transparent); }
.pfv_kind { display: inline-block; color: var(--pfv_accent); font-size: 13px; line-height: 1.6; margin-bottom: 11px; }
.pf_v2 .pfv_outcome_intro h2 { font-size: 28px; line-height: 1.45; letter-spacing: -.7px; font-weight: 650; overflow-wrap: anywhere; }
.pfv_outcome_intro .pfv_prose { margin-top: 13px; color: var(--pfv_muted); }
.pfv_selected_plugins { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 16px; }
.pfv_selected_plugins > span { font-size: 12px; line-height: 1.6; padding: 4px 9px; border: 1px solid var(--pfv_line); border-radius: 6px; overflow-wrap: anywhere; }
.pfv_workspace_picker { margin-top: 16px; }
.pfv_workspace_picker .pf_section { padding: 15px 0; border: 0; }
.pfv_workspace_picker h2, .pfv_workspace_picker h3 { font-size: 15px; }
.pfv_execution { margin-top: 20px; padding: 15px 17px; border: 1px solid var(--pfv_line); border-left: 3px solid var(--pfv_accent); border-radius: 10px; background: var(--pfv_canvas); }
.pfv_execution_heading { display: flex; align-items: center; justify-content: space-between; gap: 15px; }
.pf_v2 .pfv_execution h3 { font-size: 16px; }
.pfv_execution .pfv_prose { margin-top: 7px; font-size: 14px; }
.pfv_execution_details { margin-top: 7px; white-space: pre-wrap; overflow-wrap: anywhere; }
.pfv_creation_summary { margin: 23px 0 0; }
.pfv_creation_summary > div { display: grid; grid-template-columns: 6.5em minmax(0, 1fr); gap: 15px; margin-top: 12px; font-size: 14px; line-height: 1.8; }
.pfv_creation_summary dt { color: var(--pfv_muted); }
.pfv_creation_summary dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.pfv_save_state { margin-top: 16px !important; font-size: 12px; color: var(--pfv_muted); }
.pfv_prerequisites { margin-top: 23px; padding: 15px 17px; background: var(--pfv_canvas); border-radius: 12px; }
.pf_v2 .pfv_prerequisites h3, .pf_v2 .pfv_plan_steps > h3 { font-size: 14px; font-weight: 600; }
.pfv_list { padding-left: 19px; margin: 9px 0 0; font-size: 14px; line-height: 1.8; }
.pfv_list li + li { margin-top: 5px; }
.pfv_list li { overflow-wrap: anywhere; }
.pfv_plan_steps { margin-top: 27px; }
.pfv_plan_steps > ol { list-style: none; margin: 17px 0 0; padding: 0; }
.pfv_plan_steps > ol > li { display: flex; align-items: start; gap: 13px; padding-bottom: 16px; }
.pfv_plan_steps > ol > li:last-child { padding-bottom: 0; }
.pfv_plan_steps li > div { min-width: 0; }
.pfv_step_number { display: inline-flex; justify-content: center; align-items: center; flex: none; width: 25px; height: 25px; margin-top: 2px; border-radius: 50%; color: var(--pfv_accent); background: var(--pfv_tint); font-size: 12px; font-variant-numeric: tabular-nums; }
.pfv_plan_steps h4 { margin: 0 0 4px; font-size: 15px; line-height: 1.7; font-weight: 600; }
.pfv_plan_steps .pfv_prose { font-size: 14px; }
.pfv_plan_steps .pfv_hint { margin-top: 5px; font-size: 12px; }
.pfv_plan_steps .pfv_disclosure { border: 0; margin-top: 3px; }
.pfv_plan_steps .pfv_disclosure > summary { padding: 7px 0; min-height: 44px; font-size: 12px; }
.pfv_io { display: grid; grid-template-columns: 3em 1fr; gap: 7px 12px; font-size: 13px; margin: 0; }
.pfv_io dt { color: var(--pfv_muted); }
.pfv_io dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.pfv_outcome_actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 21px; }
.pfv_outcome_actions .pfv_primary { min-width: 166px; }
.pfv_disclosure { border-top: 1px solid var(--pfv_line); margin-top: 16px; }
.pfv_disclosure > summary { cursor: pointer; padding: 13px 0; color: var(--pfv_muted); font-size: 13px; line-height: 1.7; }
.pfv_disclosure_body { padding: 0 0 16px; min-width: 0; }
.pfv_next_step { margin-top: 17px; }
.pfv_next_step > summary { color: var(--pfv_accent); }
.pfv_next_step .pf_section { padding: 18px 0; border-color: var(--pfv_line); }
.pfv_next_step .pf_section:first-child { padding-top: 6px; }
.pfv_next_step .pf_section:last-child { padding-bottom: 0; border-bottom: 0; }
.pfv_next_step h2, .pfv_evidence h2 { font-size: 17px; }
.pfv_next_step h3, .pfv_evidence h3 { font-size: 15px; }
.pfv_next_step .pf_muted, .pfv_evidence .pf_muted { font-size: 13px; }
.pfv_evidence { margin-top: 25px; border-top: 1px solid var(--pfv_line); }
.pfv_evidence > .pf_details, .pfv_evidence > .pfv_disclosure { margin: 0; padding: 0; border: 0; border-bottom: 1px solid var(--pfv_line); border-radius: 0; }
.pfv_evidence > details:last-child { border-bottom: 0; }
.pfv_evidence > details > summary { min-height: 48px; padding: 12px 0; font-size: 13px; }
.pfv_evidence .pf_section { padding: 15px 0; }
.pfv_evidence .pf_candidate { padding: 15px; background: var(--pfv_canvas); }
.pfv_evidence .pf_candidate_head { flex-wrap: wrap; }
.pfv_source_notice { font-size: 13px; line-height: 1.8; padding: 14px 17px; margin-bottom: 14px; border: 1px solid var(--pfv_strong_line); border-left: 3px solid var(--pfv_accent); border-radius: 10px; background: var(--pfv_paper); }
.pfv_source_notice .pfv_button { padding-left: 0; color: var(--pfv_accent); }
.pfv_outcome_empty { padding: 42px 6px 52px; min-height: 310px; }
.pf_v2 .pfv_outcome_empty h3 { font-size: 23px; margin-bottom: 14px; }
.pfv_outcome_empty .pfv_hint { margin-top: 14px; }
.pfv_outcome_empty .pfv_primary { margin-top: 22px; }
.pfv_empty_mark { color: var(--pfv_accent); font-size: 30px; letter-spacing: 3px; margin-bottom: 18px; }
.pfv_previous_note { margin-top: 20px !important; }
.pfv_clarification { padding: 18px; margin-top: 22px; border: 1px solid var(--pfv_line); border-radius: 14px; background: var(--pfv_canvas); }
.pf_v2 .pfv_clarification h3 { margin-top: 5px; font-size: 17px; line-height: 1.6; }
.pfv_clarification .pfv_hint { margin-top: 8px; }
.pfv_choices { display: grid; gap: 8px; margin: 14px 0; }
.pfv_choices .pfv_button { justify-content: start; text-align: left; font-weight: 400; }
.pfv_choices .pfv_button[aria-pressed=true] { border-color: var(--pfv_accent); background: var(--pfv_tint); color: var(--pfv_accent); }
.pfv_answer_preview { font-size: 13px; margin-bottom: 12px !important; color: var(--pfv_muted); }
.pfv_blueprint_block { margin-top: 27px; padding-top: 22px; border-top: 1px solid var(--pfv_line); }
.pf_v2 .pfv_blueprint_block h3 { font-size: 18px; letter-spacing: -.3px; }
.pfv_blueprint_values { margin: 14px 0 0; }
.pfv_blueprint_values > div + div { margin-top: 17px; }
.pfv_blueprint_values dt { font-size: 12px; color: var(--pfv_muted); margin-bottom: 5px; }
.pfv_blueprint_values dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.85; }
.pfv_edit_block { border: 0; margin-top: 8px; }
.pfv_edit_block > summary { color: var(--pfv_accent); padding: 8px 0; }
.pfv_block_editor { padding: 17px; border: 1px solid var(--pfv_line); border-radius: 12px; background: var(--pfv_canvas); }
.pfv_field { display: block; font-size: 13px; color: var(--pfv_muted); margin-bottom: 15px; }
.pfv_field textarea { display: block; width: 100%; margin-top: 7px; border: 1px solid var(--pfv_strong_line); border-radius: 9px; background: var(--pfv_paper); color: var(--pfv_ink); min-height: 110px; resize: vertical; padding: 10px 12px; font: inherit; font-size: 14px; line-height: 1.8; }
.pfv_blueprint_back { margin-top: 15px; }
.pfv_blueprint_back .pfv_button { padding-left: 0; }
.pfv_warning { margin-top: 16px !important; padding: 12px 15px; border-left: 3px solid var(--pfv_accent); background: var(--pfv_paper); font-size: 13px; line-height: 1.8; }
.pfv_warning .pfv_button { margin-top: 8px; }
.pfv_creation_guide { max-width: 900px; margin: auto; }
.pfv_creation_guide .pf_section { padding: 24px; background: var(--pfv_paper); border-color: var(--pfv_line); }
.pfv_creation_guide h2 { font-size: 25px; }
.pfv_creation_guide h3 { font-size: 18px; }
.pfv_mobile_jump { display: none; }
.pfv_sr_only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@keyframes pfv_pulse { 50% { opacity: .4; } }
@container finder (max-width: 940px) {
  .pf_v2 .pf_inner { padding-inline: 26px; }
  .pfv_home_start { gap: 20px; }
  .pf_v2 .pf_featured_grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pfv_home_card { padding-inline: 20px; }
  .pfv_workspace_grid { gap: 22px; grid-template-columns: minmax(260px, .85fr) minmax(0, 1.15fr); }
  .pfv_outcome_document { padding: 23px; }
  .pfv_followup .pfv_composer_bottom { flex-wrap: wrap; }
  .pfv_followup .pfv_hint { max-width: none; flex: 1 1 120px; }
  .pf_v2 .pfv_outcome_intro h2 { font-size: 25px; }
}
@container finder (max-width: 760px) {
  .pf_v2 .pf_inner { padding: 18px 18px 32px; }
  .pf_v2 .pf_featured_requirements { grid-template-columns: 1fr; gap: 20px; }
  .pf_v2 .pf_featured_detail_heading { flex-wrap: wrap; gap: 10px; }
  .pf_v2 .pf_featured_metadata { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pf_v2 .pf_featured_metadata > div:last-child { grid-column: 1 / -1; }
  .pf_v2 .pf_header { gap: 10px; margin-bottom: 24px; padding-bottom: 12px; }
  .pf_v2:has(.pfv_home) .pf_header { margin-bottom: 18px; }
  .pf_v2 .pf_header > .pf_btn { font-size: 16px; }
  .pfv_home_start { grid-template-columns: minmax(0, 1fr); gap: 0; padding-top: 12px; padding-bottom: 30px; }
  .pfv_home_intro, .pfv_home_scenario { display: block; grid-area: auto; }
  .pfv_home_extras { grid-area: auto; }
  .pfv_home_scenario { margin-top: 28px; }
  .pfv_opportunity_column { grid-area: auto; }
  .pf_v2 .pfv_home_heading { font-size: 28px; letter-spacing: -.6px; }
  .pf_v2 .pfv_home_lead { margin: 8px 0 16px; }
  .pfv_home_card { padding: 20px; }
  .pf_v2 .pfv_scenario_card h3 { font-size: 19px; }
  .pfv_home_composer .pfv_composer_bottom { gap: 12px; align-items: end; }
  .pfv_home_composer .pfv_hint { max-width: 12em; font-size: 12px; }
  .pfv_home_composer .pfv_primary { flex: none; padding-inline: 15px; }
  .pfv_examples { gap: 2px 4px; }
  .pfv_examples > .pfv_hint { margin-top: 3px; }
  .pfv_resume { align-items: start; flex-wrap: wrap; gap: 9px; }
  .pf_v2 .pf_featured_group > .pf_section_head { align-items: start; flex-direction: row; }
  .pf_v2 .pf_featured_group h2 { font-size: 21px; }
  .pf_v2 .pf_featured_group > .pf_section_head > .pf_small { font-size: 12px; padding-top: 5px; }
  .pf_v2 .pf_featured_grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .pf_v2 .pf_featured_card { padding: 21px 20px 13px; min-height: 0; }
  .pf_v2 .pf_featured_card h3 { font-size: 17px; }
  .pf_v2 .pf_featured_summary { font-size: 14px; }
  .pf_v2 .pf_featured_detail .pf_section { padding: 20px; }
  .pfv_workspace_nav { margin-top: -8px; gap: 8px; flex-wrap: wrap; }
  .pfv_workspace_nav > .pfv_hint { flex: 1; }
  .pfv_request_summary > p { grid-template-columns: 1fr; gap: 3px; }
  .pfv_request_summary > p + p { margin-top: 9px; }
  .pfv_request_summary > .pfv_disclosure { margin-left: 0; }
  .pfv_creation_summary > div { grid-template-columns: 1fr; gap: 2px; }
  .pfv_workspace_grid { grid-template-columns: 1fr; gap: 29px; }
  .pfv_conversation { position: static; max-height: none; scroll-margin-top: 16px; }
  .pfv_messages { max-height: 48vh; padding-right: 5px; }
  .pfv_conversation_bottom { margin-top: 3px; }
  .pfv_followup .pfv_hint { flex: 1; }
  .pfv_followup .pfv_composer_bottom { flex-wrap: nowrap; }
  .pfv_outcome_document { padding: 22px 19px; border-radius: 17px; }
  .pfv_outcome_actions { align-items: stretch; }
  .pfv_outcome_actions .pfv_primary { flex-basis: 100%; }
  .pfv_outcome_actions .pfv_quiet { justify-content: center; width: 100%; }
  .pfv_mobile_jump { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 8px 6px; color: var(--pfv_accent); font-size: 13px; text-decoration: none; border-radius: 6px; }
  .pfv_return_composer { width: 100%; margin-top: 12px; }
  .pfv_clarification { max-height: none; }
  .pfv_creation_guide .pf_section { padding: 20px; }
  .pfv_next_step .pf_actions .pf_btn { flex-grow: 0; }
}
@container finder (max-width: 460px) {
  .pf_v2 .pf_featured_grid { grid-template-columns: 1fr; }
  .pfv_featured_identity { flex-direction: row; align-items: center; gap: 14px; }
  .pfv_featured_icon { width: 28px; height: 28px; }
}
@container finder (max-width: 380px) {
  .pf_v2 .pf_inner { padding-inline: 14px; }
  .pfv_home_composer .pfv_composer_bottom { flex-wrap: wrap; }
  .pfv_home_composer .pfv_hint { max-width: none; }
  .pfv_home_composer .pfv_primary { margin-left: auto; }
  .pfv_followup .pfv_composer_bottom { flex-wrap: wrap; }
  .pf_v2 .pfv_home_heading { font-size: 26px; }
}
.pfv_community { margin-top: 44px; padding-top: 36px; border-top: 1px solid var(--pfv_line); }
.pfv_community_header, .pfv_community_group_heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.pf_v2 .pfv_community h2 { margin: 0; font-size: 28px; line-height: 1.5; font-weight: 650; letter-spacing: -.4px; }
.pfv_community_header .pfv_hint { margin: 6px 0 0; font-size: 14px; }
.pfv_community_count { color: var(--pfv_muted); font-size: 13px; white-space: nowrap; }
.pfv_community_store_actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 12px; }
.pf_v2 .pfv_store_browse { border-color: var(--pfv_line); color: var(--pfv_accent); }
.pfv_community_groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-top: 28px; }
.pfv_community_group { min-width: 0; display: grid; grid-template-rows: auto 1fr; background: var(--pfv_paper); border: 1px solid var(--pfv_line); border-radius: 18px; overflow: hidden; box-shadow: 0 2px 3px color-mix(in srgb, var(--pfv_ink) 2%, transparent); }
.pfv_community_group_heading { min-height: 100px; padding: 20px 22px; border-bottom: 1px solid var(--pfv_line); background: color-mix(in srgb, var(--pfv_accent) 3%, var(--pfv_paper)); }
.pfv_community_category { display: flex; align-items: center; min-width: 0; gap: 12px; }
.pfv_community_category_icon { display: grid; place-items: center; flex: none; width: 42px; height: 42px; border: 1px solid color-mix(in srgb, var(--pfv_accent) 14%, var(--pfv_line)); border-radius: 12px; background: var(--pfv_paper); color: var(--pfv_accent); }
.pf_v2 .pfv_community_category_description { margin: 4px 0 0; font-size: 12px; color: var(--pfv_muted); line-height: 1.6; }
.pfv_community .pfv_community_group > ul { display: grid; grid-template-rows: repeat(3, 1fr); padding: 0 22px; }
.pfv_community_symbol { width: 34px; height: 38px; display: grid; place-items: center; flex: none; align-self: start; margin-top: 3px; color: var(--pfv_accent); background: var(--pfv_tint); border-radius: 9px; }
.pfv_community_symbol svg { width: 21px; height: 21px; }
.pfv_community_category svg { width: 22px; height: 22px; flex: none; color: inherit; }
.pf_v2 .pfv_community h3 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: -.2px; }
.pfv_community ul { list-style: none; margin: 0; padding: 0; }
.pfv_community_entry { min-width: 0; display: flex; align-items: center; gap: 12px; padding: 20px 0; border-bottom: 1px solid var(--pfv_line); }
.pfv_community_group .pfv_community_entry:last-child { border-bottom: 0; }
.pfv_community_entry_body { min-width: 0; flex: 1; }
.pf_v2 .pfv_community h4 { margin: 0; font-size: 15px; line-height: 1.55; font-weight: 650; overflow-wrap: anywhere; }
.pf_v2 .pfv_community_summary { margin: 5px 0 0; color: var(--pfv_ink); font-size: 13.5px; line-height: 1.65; overflow-wrap: anywhere; }
.pf_v2 .pfv_community_identity { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 6px; margin: 5px 0 0; color: var(--pfv_muted); font-size: 12.5px; line-height: 1.6; overflow-wrap: anywhere; }
.pfv_community_requirement { color: var(--pfv_ink); }
.pfv_community_identity a { min-width: 0; color: inherit; text-decoration: none; text-underline-offset: 3px; }
.pfv_community_identity a:hover { color: var(--pfv_accent); text-decoration: underline; }
.pfv_community_author { font: inherit; color: var(--pfv_muted); }
.pfv_community_entry_actions { flex: 0 0 76px; }
.pf_v2 .pfv_community_button { min-height: 44px; padding: 8px 12px; font-size: 13px; line-height: 1.5; }
.pfv_community_entry_actions .pfv_community_button { border-color: var(--pfv_line); background: var(--pfv_paper); color: var(--pfv_accent); font-weight: 550; white-space: nowrap; width: 76px; padding-inline: 7px; }
.pfv_community_entry_actions .pfv_community_button:hover:not(:disabled) { color: var(--pfv_accent); background: var(--pfv_tint); }
.pf_v2 .pfv_community_all { flex: none; min-height: 44px; padding: 7px 0 7px 12px; border: 0; color: var(--pfv_accent); background: transparent; font-size: 12px; font-weight: 500; white-space: nowrap; }
.pf_v2 .pfv_community_all:hover { color: var(--pfv_accent); background: transparent; text-decoration: underline; text-underline-offset: 4px; }
.pf_v2 .pfv_community_provenance { display: flex; gap: 4px 12px; flex-wrap: wrap; margin: 28px 0 0; padding-top: 16px; border-top: 1px solid var(--pfv_line); color: var(--pfv_muted); font-size: 12px; line-height: 1.7; }
.pfv_community_provenance a { color: var(--pfv_muted); text-underline-offset: 3px; }
.pfv_community_filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 24px 0 18px; }
.pfv_community_filters .pfv_community_button { border-color: transparent; background: transparent; color: var(--pfv_muted); }
.pfv_community_filters [aria-pressed=true] { color: var(--pfv_accent); background: var(--pfv_tint); }
.pfv_community_search { display: grid; gap: 7px; max-width: 540px; font-size: 13px; font-weight: 600; }
.pfv_community_search input { min-width: 0; width: 100%; box-sizing: border-box; font: inherit; font-weight: 400; color: var(--pfv_ink); background: var(--pfv_paper); border: 1px solid var(--pfv_strong_line); border-radius: 10px; min-height: 46px; padding: 10px 14px; }
.pfv_community_search input::placeholder { color: var(--pfv_muted); }
.pf_v2 .pfv_community_results { margin: 18px 0 2px; font-size: 13px; color: var(--pfv_muted); }
.pfv_community_list .pfv_community_entry { gap: 32px; padding: 22px 0; }
.pfv_community_list .pfv_community_entry_body { max-width: 78ch; }
.pfv_community_list .pfv_community_entry_actions { margin-left: auto; }
.pfv_community_list .pfv_community_summary { font-size: 14px; line-height: 1.8; margin-top: 6px; }
.pfv_community_list h4 { font-size: 16px; }
.pfv_community_source_category { display: inline-block; margin-top: 5px; color: var(--pfv_muted); font-size: 12px; }
.pfv_community_pages { display: flex; justify-content: center; align-items: center; gap: 18px; margin: 24px 0 0; font-size: 13px; color: var(--pfv_muted); }
.pfv_community_empty { padding: 40px 0; }
.pfv_community_empty p { margin: 0 0 7px; }
.pfv_community :is(button, a, input, h2):focus-visible { outline: 3px solid var(--pfv_accent); outline-offset: 3px; }
@container finder (max-width: 1000px) { .pfv_community_groups { gap: 20px; } }
@container finder (max-width: 800px) {
  .pfv_community_groups { grid-template-columns: minmax(0, 1fr); row-gap: 26px; }
  .pfv_community_entry { padding: 17px 0; }
}
@container finder (max-width: 640px) {
  .pfv_community { margin-top: 30px; padding-top: 26px; }
  .pfv_community_groups { margin-top: 20px; }
  .pfv_community_header { align-items: flex-start; flex-wrap: wrap; gap: 8px; }
  .pfv_community_header .pfv_community_count { flex-basis: 100%; }
  .pfv_community_store_actions { justify-content: flex-start; gap: 10px; }
  .pfv_store_jump { padding-left: 0; margin-left: 0; }
  .pf_v2 .pfv_community h2 { font-size: 22px; }
  .pfv_community_group_heading { gap: 8px; padding: 18px 16px; min-height: 90px; }
  .pfv_community_category { gap: 9px; }
  .pfv_community_category_icon { width: 36px; height: 38px; }
  .pfv_community_symbol { width: 28px; height: 34px; }
  .pf_v2 .pfv_community h3 { font-size: 17px; }
  .pfv_community .pfv_community_group > ul { display: block; padding-inline: 16px; }
  .pfv_community_group .pfv_community_entry { display: grid; grid-template-columns: 28px minmax(0, 1fr) 76px; align-items: start; gap: 4px 10px; padding: 18px 0; }
  .pfv_community_group .pfv_community_entry_body { display: contents; }
  .pfv_community_group .pfv_community_symbol { grid-column: 1; grid-row: 1 / 3; }
  .pfv_community_group h4 { grid-column: 2 / 4; }
  .pfv_community_group .pfv_community_summary { grid-column: 2 / 4; margin-top: 0; }
  .pfv_community_group .pfv_community_identity { grid-column: 2; margin-top: 4px; }
  .pfv_community_group .pfv_community_requirement { display: block; margin-top: 3px; }
  .pfv_community_group .pfv_community_entry_actions { grid-column: 3; align-self: end; margin-left: 0; }
  .pfv_community_entry { gap: 10px; }
  .pfv_community_entry_actions .pfv_community_button { padding-inline: 9px; }
  .pfv_community_list .pfv_community_entry { align-items: start; gap: 14px; }
  .pfv_community_pages { gap: 12px; }
  .pfv_community_identity { font-size: 12.5px; }
}

/* Curated products stay compact. Community categories contain simple rows,
   so six category modules remain distinct from the four selected products. */
.pf_v2 .pfv_featured_collection { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.pf_v2 .pfv_featured_collection .pf_featured_card { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; gap: 4px 14px; padding: 18px 20px; background: var(--pfv_paper); border: 1px solid var(--pfv_line); border-radius: 13px; }
.pfv_featured_identity { display: contents; }
.pfv_featured_icon { width: 42px; height: 42px; padding: 9px; background: var(--pfv_tint); border-radius: 12px; grid-column: 1; grid-row: 1 / 4; margin-top: 3px; color: var(--pfv_accent); }
.pf_v2 .pfv_featured_collection h3 { grid-column: 2; grid-row: 1; align-self: center; font-size: 16px; }
.pf_v2 .pfv_featured_collection .pf_featured_summary { grid-column: 2 / 4; grid-row: 2; font-size: 14px; line-height: 1.7; }
.pf_v2 .pfv_featured_collection .pf_featured_reason { grid-column: 2 / 4; margin: 3px 0 !important; }
.pf_v2 .pfv_featured_collection .pf_featured_card_actions { display: contents; }
.pf_v2 .pfv_featured_collection .pf_featured_status { grid-column: 2; font-size: 12px; margin-top: 5px; align-self: end; }
.pf_v2 .pfv_featured_collection .pf_featured_card_actions .pf_btn { grid-column: 3; grid-row: 1; margin-block: -9px; color: var(--pfv_muted); }
.pf_v2 .pfv_featured_collection .pf_featured_card_actions .pf_btn:hover { color: var(--pfv_accent); }
@container finder (max-width: 760px) {
  .pf_v2 .pfv_featured_collection { grid-template-columns: 1fr; gap: 12px; }
  .pf_v2 .pfv_featured_collection .pf_featured_card { padding: 17px; gap: 4px 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .pfv_composer, .pfv_button { transition: none; }
  .pfv_progress_dot { animation: none; }
}

.pfv_opportunity .pfv_home_card { min-height: 228px; }
.pfv_opportunity_evidence { margin-top: 12px; color: var(--pfv_muted); font-size: 12px; }
.pfv_opportunity_evidence summary,.pfv_opportunity_controls summary { min-height: 32px; cursor: pointer; display: flex; align-items: center; }
.pfv_opportunity_evidence > div { margin: 8px 0; overflow-wrap: anywhere; }
.pfv_opportunity_evidence p { margin-top: 4px; white-space: pre-wrap; }
.pfv_opportunity_controls { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-top: 8px; color: var(--pfv_muted); font-size: 12px; }
.pfv_opportunity_controls > .pfv_button { padding: 4px 0; font-size: 12px; }
.pfv_opportunity_controls details .pfv_button { display: block; }
.pfv_opportunity_settings { padding: 24px 0 32px; border-block: 1px solid var(--pfv_line); margin-bottom: 32px; }
.pfv_scope_columns { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 32px; }
.pfv_scope_columns fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
.pfv_scope_columns legend { font-weight: 600; margin-bottom: 12px; }
.pfv_scope_columns select,.pfv_scope_columns textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--pfv_strong_line); color: var(--pfv_ink); background: var(--pfv_paper); border-radius: 8px; font: inherit; }
.pfv_scope_columns details { margin-top: 12px; font-size: 13px; }
.pfv_scope_columns summary { min-height: 44px; cursor: pointer; padding-block: 10px; }
.pfv_scope_columns details label { display: block; margin-bottom: 8px; }
.pfv_scope_list { max-height: 280px; overflow-y: auto; margin-top: 12px; }
.pfv_scope_choice { min-height: 44px; display: flex; align-items: flex-start; gap: 10px; padding-block: 10px; line-height: 1.7; font-size: 14px; cursor: pointer; overflow-wrap: anywhere; }
.pfv_scope_choice input { margin-top: 4px; flex-shrink: 0; accent-color: var(--pfv_accent); }
.pfv_scope_footer { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 24px; }
.pfv_product_intro { display: grid; grid-template-columns: minmax(0,1fr) 44px; gap: 16px; align-items: center; margin: 0 0 8px; padding: 4px 15px 4px 18px; border: 1px solid var(--pfv_line); border-left: 2px solid var(--pfv_accent); border-radius: 10px; background: var(--pfv_paper); }
.pfv_product_intro > div { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; min-width: 0; }
.pf_v2 .pfv_product_intro h2 { font-size: 13px; font-weight: 600; margin: 0; line-height: 1.7; color: var(--pfv_ink); }
.pfv_product_intro p { font-size: 13px; color: var(--pfv_muted); line-height: 1.7; margin: 0; }
.pfv_intro_close { width: 44px; min-width: 44px; padding: 0; margin: -6px -6px -6px 0; }
@container finder (max-width: 820px) { .pfv_scope_columns { grid-template-columns: minmax(0,1fr); gap: 24px; } }
@container finder (max-width: 520px) { .pfv_product_intro { padding: 12px 10px 12px 14px; gap: 8px; } .pfv_product_intro > div { gap: 3px; } .pfv_scope_footer { align-items: flex-start; flex-direction: column; } }

.pfv_opportunity .pfv_scenario_card > h3 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pfv_opportunity .pfv_scenario_card > .pfv_prose { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pfv_opportunity_controls { grid-column: 2; grid-row: 4; }

@container finder (max-width: 760px) { .pfv_opportunity_controls { grid-area: auto; margin-top: 8px; } }

/* The expert is the signature; the request remains the sole primary entry. */
.pfv_expert_identity { display: flex; align-items: center; gap: 20px; padding: 8px 0 22px; }
.pfv_expert_identity > div { min-width: 0; }
.pfv_expert_mark { width: 64px; height: 64px; flex: none; color: var(--pfv_accent); }
.pfv_expert_mark svg { display: block; width: 100%; height: 100%; }
.pf_v2 .pfv_expert_identity h1 { margin: 7px 0 0; font-size: clamp(27px, 3.2cqi, 38px); line-height: 1.3; letter-spacing: -1.2px; font-weight: 650; color: var(--pfv_ink); text-wrap: balance; }
.pfv_expert_identity p { margin: 10px 0 0; color: var(--pfv_muted); font-size: 14px; line-height: 1.7; }
.pf_v2 .pfv_expert_identity .pfv_expert_name { margin: 0; color: var(--pfv_accent); font-size: 13px; line-height: 1.5; font-weight: 600; }
.pfv_home .pfv_home_heading { font-size: 20px; line-height: 1.4; letter-spacing: -.3px; }
.pfv_home .pfv_home_lead { font-size: 13px; margin: 8px 0 16px; line-height: 1.7; }
.pfv_home .pfv_home_card { min-height: 232px; }
.pfv_home .pfv_home_composer { border-color: color-mix(in srgb, var(--pfv_accent) 22%, var(--pfv_strong_line)); box-shadow: 0 5px 18px color-mix(in srgb, var(--pfv_ink) 4%, transparent); }
.pfv_home .pfv_home_composer:focus-within { border-color: var(--pfv_accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pfv_accent) 10%, transparent); }
.pfv_home .pfv_scenario_card { border-color: color-mix(in srgb, var(--pfv_accent) 12%, var(--pfv_line)); background: var(--pfv_tint); box-shadow: none; }
.pfv_home .pfv_scenario_card h3 { font-size: 19px; line-height: 1.55; }
.pfv_home .pfv_scenario_reason { line-height: 1.65; }
@container finder (max-width: 760px) {
  .pfv_expert_identity { gap: 14px; padding: 4px 0 24px; align-items: flex-start; }
  .pfv_expert_mark { width: 46px; height: 46px; margin-top: 7px; }
  .pf_v2 .pfv_expert_identity h1 { font-size: 28px; line-height: 1.4; letter-spacing: -.7px; }
  .pfv_expert_identity p { font-size: 13px; margin-top: 8px; }
  .pfv_home .pfv_home_heading { font-size: 20px; }
  .pfv_home .pfv_home_card { min-height: 216px; }
}

/* Planned abilities are a compact explanation, never proof of installation. */
.pfv_capabilities { margin-top: 24px; }
.pfv_capabilities_heading { display: flex; align-items: baseline; flex-wrap: wrap; justify-content: space-between; gap: 5px 16px; margin-bottom: 12px; }
.pf_v2 .pfv_capabilities_heading h3 { margin: 0; font-size: 14px; font-weight: 600; }
.pfv_capabilities_heading .pfv_hint { font-size: 12px; }
.pfv_capability_map { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(190px, 100%), 1fr)); list-style: none; padding: 0; margin: 0; gap: 10px; }
.pfv_capability_map_hybrid { grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: 16px; }
.pfv_capability_item { min-width: 0; border: 1px solid var(--pfv_line); border-radius: 10px; padding: 14px 16px; background: var(--pfv_canvas); overflow-wrap: anywhere; }
.pfv_reuse_list { list-style: none; padding: 0; margin: 0; }
.pfv_reuse_list > li + li { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--pfv_line); }
.pfv_gap_list { margin: 12px 0 0; padding-left: 17px; font-size: 13px; line-height: 1.8; color: var(--pfv_ink); }
.pfv_gap_list > li + li { margin-top: 5px; }
.pfv_capability_item > .pfv_disclosure { margin-top: 10px; border-color: color-mix(in srgb, var(--pfv_accent) 18%, transparent); }
.pfv_capability_item > .pfv_disclosure > summary { padding: 9px 0; min-height: 36px; font-size: 12px; }
.pfv_gap_evidence { margin: 0; font-size: 12px; line-height: 1.75; }
.pfv_gap_evidence > div + div { margin-top: 12px; }
.pfv_gap_evidence dt { color: var(--pfv_ink); font-weight: 600; }
.pfv_gap_evidence dd { margin: 3px 0 0; color: var(--pfv_muted); }
.pfv_capability_kind { display: block; font-size: 12px; line-height: 1.6; margin-bottom: 7px; color: var(--pfv_muted); }
.pfv_capability_item strong { display: block; color: var(--pfv_ink); font-size: 15px; font-weight: 600; line-height: 1.6; }
.pfv_capability_version { display: block; font-size: 12px; color: var(--pfv_muted); line-height: 1.6; margin-top: 3px; }
.pf_v2 .pfv_capability_purpose { font-size: 13px; line-height: 1.7; margin: 8px 0 0; color: var(--pfv_muted); white-space: pre-wrap; }
.pfv_capability_gap { border-style: dashed; border-color: color-mix(in srgb, var(--pfv_accent) 45%, var(--pfv_line)); background: var(--pfv_tint); }
.pfv_capability_gap .pfv_capability_kind { color: var(--pfv_accent); }

/* Runtime output owns the large surface; the saved plan is secondary context. */
.pfv_outcome_document.pfv_outcome_live { padding: 0; border: 0; box-shadow: none; background: transparent; }
.pfv_result_grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(230px, .36fr); gap: 28px; align-items: start; }
.pfv_result_primary { min-width: 0; }
.pfv_result_primary .pfv_execution { margin: 0; padding: 20px; background: var(--pfv_paper); border: 1px solid var(--pfv_line); border-radius: 16px; box-shadow: 0 5px 18px color-mix(in srgb, var(--pfv_ink) 3%, transparent); }
.pfv_result_primary .pfv_execution_heading { padding-bottom: 13px; border-bottom: 1px solid var(--pfv_line); }
.pfv_result_primary .pfv_execution_heading h3 { font-size: 17px; }
.pfv_result_primary .pf_execution_conversation { min-width: 0; margin-top: 16px; min-height: 320px !important; height: min(58vh, 620px) !important; }
.pfv_result_primary .pf_execution_file_preview { min-width: 0; }
.pfv_solution_overview { min-width: 0; padding: 6px 0 16px; }
.pf_v2 .pfv_solution_overview .pfv_outcome_intro h2 { font-size: 20px; line-height: 1.55; letter-spacing: -.35px; }
.pfv_solution_overview .pfv_kind { font-size: 12px; margin-bottom: 8px; }
.pfv_solution_overview .pfv_capabilities { margin-top: 20px; }
.pfv_solution_overview .pfv_capabilities_heading .pfv_hint { display: none; }
.pfv_solution_overview .pfv_capability_map { grid-template-columns: minmax(0, 1fr); gap: 0; border-block: 1px solid var(--pfv_line); }
.pfv_solution_overview .pfv_capability_item { padding: 14px 0; border: 0; border-bottom: 1px solid var(--pfv_line); border-radius: 0; background: transparent; }
.pfv_solution_overview .pfv_capability_item:last-child { border-bottom: 0; }
.pfv_solution_overview .pfv_capability_gap { padding-left: 12px; border-left: 2px solid var(--pfv_accent); }
.pfv_solution_overview .pfv_capability_kind { margin-bottom: 4px; }
.pfv_solution_overview .pfv_capability_item strong { font-size: 14px; }
.pfv_solution_overview .pfv_outcome_actions { gap: 6px; margin-top: 16px; }
.pfv_solution_overview .pfv_outcome_actions .pfv_button { font-size: 13px; min-width: 0; }
.pfv_solution_overview .pfv_prerequisites { padding: 0; border-radius: 0; background: transparent; }
.pfv_solution_overview .pfv_prerequisites .pfv_list { font-size: 12px; color: var(--pfv_muted); }
@container finder (max-width: 900px) {
  .pfv_result_grid { grid-template-columns: minmax(0, 1fr); gap: 24px; }
  .pfv_solution_overview { border-top: 1px solid var(--pfv_line); padding-top: 20px; }
  .pfv_solution_overview .pfv_capability_map { grid-template-columns: repeat(auto-fit, minmax(min(190px, 100%), 1fr)); gap: 10px; border: 0; }
  .pfv_solution_overview .pfv_capability_item { padding: 14px; border: 1px solid var(--pfv_line); border-radius: 10px; background: var(--pfv_paper); }
  .pfv_solution_overview .pfv_capability_gap { border-style: dashed; border-color: var(--pfv_accent); }
}
@container finder (max-width: 520px) {
  .pfv_capability_map_hybrid { grid-template-columns: minmax(0, 1fr); }
  .pfv_result_primary .pfv_execution { padding: 16px; }
  .pfv_result_primary .pf_execution_conversation { min-height: 300px !important; height: min(64vh, 580px) !important; }
  .pf_v2 .pfv_expert_identity h1 { font-size: 25px; }
}

/* One compact recap of the latest searches, visible on the home page. */
.pfv_last_search { display: grid; gap: 10px; margin: 0 0 18px; padding: 16px 18px; background: var(--pfv_paper); border: 1px solid var(--pfv_line); border-radius: 14px; }
.pfv_last_search_heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.pf_v2 .pfv_last_search_heading h2 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: .01em; }
.pfv_last_search_item { display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid var(--pfv_line); }
.pfv_last_search_item:first-of-type { padding-top: 0; border-top: 0; }
.pfv_last_search_meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: var(--pfv_muted); }
.pfv_last_search_kind { padding: 1px 8px; border: 1px solid var(--pfv_strong_line); border-radius: 999px; background: var(--pfv_tint); color: var(--pfv_muted); }
.pfv_last_search_request { margin: 0 !important; font-size: 13.5px; line-height: 1.7; overflow-wrap: anywhere; }
.pfv_last_search_sources { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0; padding: 0; list-style: none; font-size: 12px; color: var(--pfv_muted); }
.pfv_last_search_source { display: inline-flex; align-items: baseline; gap: 6px; }
.pfv_last_search_source_title { color: var(--pfv_ink); }
.pfv_last_search_source_failed .pfv_last_search_source_title,
.pfv_last_search_source_failed .pfv_last_search_source_count { color: var(--dsw-alias-state-error-primary, #b42318); }
@container finder (max-width: 520px) {
  .pfv_last_search { padding: 14px; }
  .pfv_last_search_heading { align-items: flex-start; flex-direction: column; gap: 2px; }
}

/* Catalog browsing keeps its list mounted; the selected plugin owns this page. */
.pfv_plugin_detail { padding: 0 0 24px; }
.pfv_plugin_back { margin: 0 0 26px -10px; }
.pfv_plugin_hero { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 42px; align-items: start; padding-bottom: 34px; border-bottom: 1px solid var(--pfv_line); }
.pfv_plugin_kicker { font-size: 12px; letter-spacing: .04em; color: var(--pfv_muted); margin-bottom: 10px !important; }
.pf_v2 .pfv_plugin_identity h1 { font-size: 28px; line-height: 1.4; letter-spacing: -.02em; overflow-wrap: anywhere; }
.pfv_plugin_name { margin-top: 9px !important; color: var(--pfv_muted); overflow-wrap: anywhere; font-size: 13px; }
.pfv_plugin_summary { margin-top: 18px !important; max-width: 660px; font-size: 15px; line-height: 1.8; color: var(--pfv_ink); }
.pfv_plugin_meta { display: flex; flex-wrap: wrap; gap: 10px 20px; margin-top: 18px; font-size: 12px; color: var(--pfv_muted); }
.pfv_plugin_install { padding-top: 28px; }
.pfv_plugin_install > .pfv_primary { width: 100%; min-height: 44px; }
.pfv_plugin_install > p { margin-top: 12px !important; font-size: 12px; color: var(--pfv_muted); line-height: 1.8; }
.pfv_plugin_install > .pfv_quiet { margin-top: 8px; }
.pfv_plugin_section { padding: 28px 0; }
.pf_v2 .pfv_plugin_section h2 { font-size: 16px; margin-bottom: 14px; }
.pfv_plugin_description { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.9; font-size: 14px; }
.pfv_plugin_facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 36px; border-bottom: 1px solid var(--pfv_line); }
.pfv_plugin_list { padding-left: 18px; margin: 0; color: var(--pfv_muted); font-size: 13px; line-height: 1.9; }
.pfv_plugin_list li + li { margin-top: 8px; }
.pfv_plugin_sources { border-top: 1px solid var(--pfv_line); }
.pfv_plugin_sources a { color: var(--pfv_accent); text-decoration: none; font-size: 13px; }
.pfv_plugin_sources > p { color: var(--pfv_muted); font-size: 12px; margin-top: 12px !important; }
.pfv_plugin_error { margin-top: 22px; padding: 14px 16px; border: 1px solid var(--pfv_line); border-radius: 10px; }
.pfv_plugin_error .pfv_button { margin-top: 10px; }
/* ==========================================================================
   v3 layer (2026-11-09). Adds the approved prototype's scales and identity on
   top of the existing structure: one column, three text levels, one scale for
   space, and a single brand mark. Nothing here removes an existing rule; it
   only overrides values that the prototype changed.
   ========================================================================== */
.pf_v2 {
  --pfv3_s1: 4px; --pfv3_s2: 8px; --pfv3_s3: 12px; --pfv3_s4: 16px;
  --pfv3_s5: 24px; --pfv3_s6: 32px; --pfv3_s7: 48px; --pfv3_s8: 64px;
  --pfv3_col: 760px;
  --pfv3_mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}
/* One column: every top-level block on the home page shares the same edges. */
.pf_v2:has(.pfv_home) .pfv_inner { padding: var(--pfv3_s5) var(--pfv3_s6) var(--pfv3_s8); }
.pf_v2 .pfv_home { max-width: none; }
.pf_v2 .pfv_home > * { max-width: var(--pfv3_col); margin-inline: auto; }
.pf_v2 .pfv_home_start { display: block; max-width: none; }
.pf_v2 .pfv_home_start > * { max-width: var(--pfv3_col); margin-inline: auto; }
.pf_v2 .pfv_home_scenario { margin-top: var(--pfv3_s5); }
.pf_v2 .pfv_home_extras { margin-top: var(--pfv3_s4); }
.pf_v2 .pfv_home_card { border-radius: 16px; }
/* Identity: one badge, same silhouette at every size. */
.pf_v2 .pfv_expert_identity { gap: var(--pfv3_s4); padding: var(--pfv3_s4) 0 var(--pfv3_s5); }
.pf_v2 .pfv_expert_mark {
  width: 44px; height: 44px; padding: 10px; border-radius: 13px; color: #fff;
  background: linear-gradient(155deg, #7c93ff, #3b56e0);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .28), 0 1px 2px rgba(0, 0, 0, .22);
}
.pf_v2 .pfv_expert_identity h1 {
  font-size: clamp(32px, 3.6cqi, 46px); line-height: 1.18; letter-spacing: -.5px; font-weight: 700;
}
.pf_v2 .pfv_expert_identity .pfv_expert_name { font-size: 12px; letter-spacing: .2px; }
.pf_v2 .pfv_expert_identity p { margin-top: var(--pfv3_s3); font-size: 15px; }
/* Header: same column as the content below it. */
.pf_v2:has(.pfv_home) .pf_header { max-width: var(--pfv3_col); margin-inline: auto; }
/* Controls: one height, one radius, an honest disabled state. */
.pf_v2 .pfv_button { border-radius: 10px; }
.pf_v2 .pfv_button.pfv_primary { background: var(--pfv_accent); color: var(--pfv_on_accent); }
.pf_v2 .pfv_button.pfv_primary:hover { filter: brightness(.93); }
.pf_v2 .pfv_button.pfv_primary:disabled,
.pf_v2 .pfv_button.pfv_primary[disabled] { opacity: .45; cursor: not-allowed; filter: none; }
.pf_v2 .pfv_composer { border-radius: 16px; }
/* The plan card: the one place that carries the brand, and the thing worth
   screenshotting. Text inside uses a hue-matched set, never grey on colour. */
.pf_v2 .pfv_plan_hero {
  position: relative; border-radius: 24px; padding: var(--pfv3_s6);
  background: radial-gradient(120% 140% at 100% 0%, #22378a 0%, #16255a 40%, #0e1838 100%);
  border: 1px solid rgba(147, 166, 255, .22);
  box-shadow: 0 16px 48px rgba(4, 10, 32, .45);
}
.pf_v2 .pfv_plan_hero p, .pf_v2 .pfv_plan_hero li, .pf_v2 .pfv_plan_hero span,
.pf_v2 .pfv_plan_hero dd, .pf_v2 .pfv_plan_hero dt, .pf_v2 .pfv_plan_hero summary { color: #c7d0f6; }
.pf_v2 .pfv_plan_hero h1, .pf_v2 .pfv_plan_hero h2, .pf_v2 .pfv_plan_hero h3, .pf_v2 .pfv_plan_hero h4,
.pf_v2 .pfv_plan_hero strong, .pf_v2 .pfv_plan_hero b { color: #eef1ff; }
.pf_v2 .pfv_plan_hero .pfv_hint, .pf_v2 .pfv_plan_hero .pfv_version { color: #9eacde; }
.pf_v2 .pfv_plan_hero a { color: #9fb0ff; }
.pf_v2 .pfv_plan_hero .pfv_disclosure { border-top-color: rgba(147, 166, 255, .18); }
.pf_v2 .pfv_plan_hero h2, .pf_v2 .pfv_plan_hero h3 { letter-spacing: -.2px; }
/* Live-panel polish after the first real screenshot: the empty composer was
   the largest object on the page, and two headings competed for the same job. */
.pf_v2 .pfv_composer textarea { min-height: 64px; }
.pf_v2 .pfv_home_heading { font-size: 16px; font-weight: 600; }
.pf_v2 .pfv_home_lead { font-size: 13px; }
.pf_v2 .pfv_last_search_request { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pf_v2 .pfv_last_search_sources { font-size: 12px; }
/* Home v3 structure: the three outcomes as one rail, and categories whose bar
   length is the real share of the catalog. */
.pf_v2 .pfv_home_composer .pfv_composer_bottom { flex-wrap: wrap; gap: var(--pfv3_s3); }
.pf_v2 .pfv_home_composer .pfv_examples { display: flex; flex: 1 1 auto; flex-wrap: wrap; align-items: center; gap: var(--pfv3_s2); }
.pf_v2 .pfv_journey { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--pfv3_s6);
  margin-top: var(--pfv3_s8); text-align: center; padding-top: var(--pfv3_s6); }
.pf_v2 .pfv_journey::before { content: ""; position: absolute; top: 10px; left: calc(100% / 6); right: calc(100% / 6); height: 2px; border-radius: 1px;
  background: linear-gradient(90deg, var(--pfv_accent), color-mix(in srgb, var(--pfv_accent) 30%, transparent)); }
.pf_v2 .pfv_journey_stop { position: relative; }
.pf_v2 .pfv_journey_stop::before { content: ""; position: absolute; top: -30px; left: 50%; margin-left: -8px; width: 16px; height: 16px; border-radius: 50%;
  background: var(--pfv_paper); border: 2px solid var(--pfv_accent); }
.pf_v2 .pfv_journey_stop.pfv_journey_auto::before { background: #43c495; border-color: #43c495; box-shadow: 0 0 0 4px rgba(67, 196, 149, .16); }
.pf_v2 .pfv_journey_stop h3 { margin: 0; font-size: 16px; font-weight: 600; color: var(--pfv_ink); }
.pf_v2 .pfv_journey_stop p { margin: 8px 0 0; font-size: 14px; line-height: 1.7; color: var(--pfv_muted); }
.pf_v2 .pfv_journey_tag { display: inline-flex; align-items: center; height: 24px; margin-top: var(--pfv3_s3); padding: 0 var(--pfv3_s2); border-radius: 999px;
  font-size: 12px; color: #2f9c76; background: rgba(67, 196, 149, .14); }
.pf_v2 .pfv_v3_block { margin-top: var(--pfv3_s7); }
.pf_v2 .pfv_v3_head { display: flex; align-items: baseline; gap: var(--pfv3_s3); margin-bottom: var(--pfv3_s4); }
.pf_v2 .pfv_v3_head h2 { margin: 0; font-size: 18px; font-weight: 600; color: var(--pfv_ink); }
.pf_v2 .pfv_v3_head span { font-size: 14px; color: var(--pfv_muted); }
.pf_v2 .pfv_v3_more { margin-left: auto; font-size: 14px; color: var(--pfv_accent); text-decoration: none; }
.pf_v2 .pfv_v3_more:hover { text-decoration: underline; text-underline-offset: 3px; }
.pf_v2 .pfv_v3_cats { display: grid; gap: var(--pfv3_s1); }
.pf_v2 .pfv_v3_cat { display: grid; grid-template-columns: 120px minmax(0, 1fr) 64px; align-items: center; gap: var(--pfv3_s4);
  padding: var(--pfv3_s2) var(--pfv3_s3); border-radius: 8px; text-decoration: none; color: inherit; }
.pf_v2 .pfv_v3_cat:hover { background: var(--pfv_tint); }
.pf_v2 .pfv_v3_cat_name b { display: block; font-size: 14px; font-weight: 600; color: var(--pfv_ink); }
.pf_v2 .pfv_v3_cat_name small { display: block; margin-top: 2px; font-size: 12px; color: var(--pfv_muted); }
.pf_v2 .pfv_v3_bar { display: block; height: 8px; border-radius: 4px; overflow: hidden;
  background: color-mix(in srgb, var(--pfv_ink) 9%, transparent); }
.pf_v2 .pfv_v3_bar i { display: block; height: 100%; border-radius: 4px;
  background: linear-gradient(90deg, var(--pfv_accent), color-mix(in srgb, var(--pfv_accent) 55%, #fff)); }
.pf_v2 .pfv_v3_cat em { font-style: normal; text-align: right; font-size: 14px; color: var(--pfv_ink); font-variant-numeric: tabular-nums; }
@container finder (max-width: 700px) {
  .pf_v2 .pfv_journey { grid-template-columns: minmax(0, 1fr); gap: var(--pfv3_s5); text-align: left; padding-top: 0; padding-left: var(--pfv3_s6); }
  .pf_v2 .pfv_journey::before { top: 8px; bottom: 8px; left: 7px; right: auto; width: 2px; height: auto;
    background: linear-gradient(180deg, var(--pfv_accent), color-mix(in srgb, var(--pfv_accent) 30%, transparent)); }
  .pf_v2 .pfv_journey_stop::before { top: 4px; left: calc(-1 * var(--pfv3_s6)); margin-left: 0; }
  .pf_v2 .pfv_v3_cat { grid-template-columns: 96px minmax(0, 1fr) 48px; gap: var(--pfv3_s3); }
  .pf_v2 .pfv_v3_cat_name small { display: none; }
}
/* Real states: waiting, and "we stopped before a verdict". */
.pf_v2 .pfv_outcome_document:has(.pfv_search_status) { padding: var(--pfv3_s6); }
.pf_v2 .pfv_search_echo { margin: 0; font-size: 12px; color: var(--pfv_muted); }
.pf_v2 .pfv_search_echo b { display: block; margin-top: var(--pfv3_s1); font-size: 20px; line-height: 1.5; font-weight: 600; color: var(--pfv_ink); }
.pf_v2 .pfv_scan { position: relative; height: 3px; margin: var(--pfv3_s5) 0 var(--pfv3_s3); border-radius: 2px; overflow: hidden;
  background: color-mix(in srgb, var(--pfv_accent) 16%, transparent); }
.pf_v2 .pfv_scan::after { content: ""; position: absolute; top: 0; bottom: 0; width: 38%; border-radius: 2px;
  background: linear-gradient(90deg, transparent, var(--pfv_accent), transparent); animation: pfv_scan 1.5s ease-in-out infinite; }
@keyframes pfv_scan { from { transform: translateX(-110%); } to { transform: translateX(300%); } }
@media (prefers-reduced-motion: reduce) { .pf_v2 .pfv_scan::after { animation: none; width: 100%; opacity: .35; } }
.pf_v2 .pfv_search_status .pfv_hint { margin: var(--pfv3_s1) 0 0; font-size: 13px; line-height: 1.7; color: var(--pfv_muted); }
/* A partial read is a warning, not fine print. */
.pf_v2 .pfv_source_notice { margin: var(--pfv3_s3) 0 0; padding: var(--pfv3_s3) var(--pfv3_s4); border: 0; border-left: 3px solid #f0a841;
  border-radius: 0 10px 10px 0; background: rgba(240, 168, 65, .10); }
.pf_v2 .pfv_source_notice p { margin: 0; font-size: 14px; line-height: 1.7; color: var(--pfv_ink); }
.pf_v2 .pfv_source_notice .pfv_hint { margin-top: var(--pfv3_s1); font-size: 12px; color: var(--pfv_muted); }
/* Breathing pass after the first live screenshot: the rail sat on the composer,
   the featured heading collided with its own note, category rows broke into three
   lines, and every section had the same gap. */
.pf_v2 .pfv_home_start > .pfv_home_intro .pfv_home_lead { margin: 2px 0 0; font-size: 12px; line-height: 1.6; }
.pf_v2 .pfv_home_composer textarea { min-height: 56px; }
.pf_v2 .pfv_journey_stop h3 { line-height: 1.5; }
.pf_v2 .pfv_journey_stop p { margin-top: 6px; }
/* Featured: one heading row, note underneath, never overlapping. */
.pf_v2 .pf_featured_group > .pf_section_head { align-items: flex-start; margin-bottom: var(--pfv3_s4); }
.pf_v2 .pf_featured_group h2 { margin: 0; font-size: 18px; line-height: 1.4; letter-spacing: 0; }
.pf_v2 .pfv_featured_intro { margin: 4px 0 0; font-size: 13px; line-height: 1.6; color: var(--pfv_muted); }
.pf_v2 .pf_featured_group { margin-top: var(--pfv3_s7); }
/* Categories: a wider name column keeps each row on one line. */
.pf_v2 .pfv_v3_cat { grid-template-columns: 168px minmax(0, 1fr) 64px; gap: var(--pfv3_s4); padding: var(--pfv3_s3) var(--pfv3_s3); }
.pf_v2 .pfv_v3_cat_name small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pf_v2 .pfv_v3_cat_name b { line-height: 1.5; }
/* Rhythm: the gap between blocks is larger than any gap inside a block. */
.pf_v2 .pfv_home_scenario { margin-top: var(--pfv3_s7); }
.pf_v2 .pfv_opportunity { margin-top: var(--pfv3_s7); }
.pf_v2 .pfv_v3_block { margin-top: var(--pfv3_s7); }
.pf_v2 .pfv_last_search { margin-top: var(--pfv3_s7); padding-top: var(--pfv3_s5); border-top: 1px solid var(--pfv_line); }
/* Found by rendering the real component: .pfv_home_card carries a 208px
   min-height, which is why the composer was a big empty box and the idea card
   was mostly blank. Compact them; the content decides the height. */
.pf_v2 .pfv_home_composer.pfv_home_card { min-height: 0; padding: var(--pfv3_s4); }
.pf_v2 .pfv_home_scenario .pfv_home_card { min-height: 0; padding: var(--pfv3_s5); align-items: flex-start; }
.pf_v2 .pfv_home_scenario .pfv_home_card h3 { margin: 0; font-size: 17px; line-height: 1.5; }
.pf_v2 .pfv_home_scenario .pfv_home_card > p { margin-top: var(--pfv3_s2); }
.pf_v2 .pfv_home_scenario .pfv_scenario_card .pfv_composer_bottom { justify-content: flex-start; margin-top: var(--pfv3_s4); padding-top: 0; }
.pf_v2 .pfv_home_scenario { margin-top: var(--pfv3_s7); }
.pf_v2 .pfv_home_scenario .pfv_home_heading { margin: 0; }
.pf_v2 .pfv_home_scenario .pfv_home_lead { margin: 2px 0 var(--pfv3_s3); }
/* Package names are identifiers, so they read as identifiers. */
.pf_v2 .pfv_reuse_list strong,
.pf_v2 .pfv_plugin_identity h1 { font-family: var(--pfv3_mono); font-weight: 500; letter-spacing: -.2px; }
.pf_v2 .pfv_reuse_list strong { font-size: .94em; }

@container finder (max-width: 700px) {
  .pfv_plugin_hero { grid-template-columns: 1fr; gap: 4px; }
  .pfv_plugin_install { padding-top: 18px; max-width: 360px; }
  .pf_v2 .pfv_plugin_identity h1 { font-size: 24px; }
  .pfv_plugin_facts { grid-template-columns: 1fr; gap: 0; }
  .pfv_plugin_facts .pfv_plugin_section + .pfv_plugin_section { padding-top: 0; }
}
`;
