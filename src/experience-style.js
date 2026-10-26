/** Finder-owned V2 layer. Host aliases supply both light and dark colors. */
export const experienceCss = `
.pf_root.pf_v2 {
  container-type: inline-size;
  container-name: finder;
  --pfv_canvas: var(--dsw-alias-bg-layer-1, #f5f6f8);
  --pfv_paper: var(--dsw-alias-bg-base, #fff);
  --pfv_ink: var(--dsw-alias-label-primary, #202730);
  --pfv_muted: var(--dsw-alias-label-secondary, #606b78);
  --pfv_line: var(--dsw-alias-border-l3, #dce4ed);
  --pfv_strong_line: var(--dsw-alias-border-l2, #becbdb);
  --pfv_accent: var(--dsw-alias-state-business-primary, #245dd8);
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
.pf_v2 .pf_inner { max-width: 1220px; padding: 26px 40px 42px; }
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
.pf_v2:has(.pfv_home) .pf_header { margin-bottom: 28px; border-bottom: 0; padding-bottom: 0; }
.pfv_home { max-width: 1080px; margin: 0 auto; }
.pfv_home_start { display: grid; grid-template-columns: minmax(0, 2fr) minmax(250px, .85fr); gap: 0 40px; align-items: stretch; padding: 24px 0 36px; }
.pfv_home_intro, .pfv_home_scenario { display: grid; grid-template-rows: subgrid; grid-row: 1 / 4; min-width: 0; padding: 0; margin: 0; }
.pfv_home_intro { grid-column: 1; }
.pfv_home_scenario { grid-column: 2; }
.pfv_home_extras { grid-area: 4 / 1; min-width: 0; padding-bottom: 4px; }
.pf_v2 .pfv_home_heading { margin: 0; font-size: 32px; line-height: 1.35; letter-spacing: -.8px; font-weight: 650; }
.pf_v2 .pfv_home_lead { font-size: 14px; color: var(--pfv_muted); margin: 8px 0 22px; line-height: 1.75; }
.pf_v2 .pfv_scenario_card h3 { margin: 0; font-size: 20px; line-height: 1.55; letter-spacing: -.3px; font-weight: 600; text-wrap: balance; }
.pf_v2 .pfv_scenario_card .pfv_prose { font-size: 14px; line-height: 1.85; margin-top: 10px; color: var(--pfv_muted); }
.pfv_scenario_reason { font-size: 12px; color: var(--pfv_accent); margin-top: 12px !important; }
.pf_v2 .pfv_home_scenario .pfv_scenario_start { border-color: var(--pfv_strong_line); background: var(--pfv_paper); color: var(--pfv_accent); }
.pf_v2 .pfv_home_scenario .pfv_scenario_start:hover:not(:disabled) { background: var(--pfv_tint); border-color: var(--pfv_accent); }
.pfv_composer { border: 1px solid var(--pfv_strong_line); border-radius: 20px; background: var(--pfv_paper); padding: 18px 20px 16px; transition: border-color 160ms ease, box-shadow 160ms ease; }
.pfv_composer:focus-within { border-color: var(--pfv_accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pfv_accent) 11%, transparent); }
.pfv_home_card { display: flex; flex-direction: column; min-width: 0; min-height: 228px; margin: 0; padding: 22px 24px 20px; border: 1px solid var(--pfv_strong_line); border-radius: 16px; }
.pfv_home_composer { background: var(--pfv_paper); box-shadow: 0 4px 18px color-mix(in srgb, var(--pfv_ink) 4%, transparent); }
.pfv_scenario_card { background: color-mix(in srgb, var(--pfv_accent) 6%, var(--pfv_paper)); border-color: color-mix(in srgb, var(--pfv_accent) 10%, var(--pfv_line)); }
.pfv_home_card .pfv_composer_bottom { justify-content: flex-end; margin-top: auto; padding-top: 18px; flex: none; }
.pf_v2 .pfv_home_card .pfv_composer_bottom > .pfv_button { box-sizing: border-box; width: 132px; height: 44px; min-height: 44px; flex: none; margin: 0; padding: 8px 14px; }
.pfv_home_selection { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--pfv_line); color: var(--pfv_muted); font-size: 13px; line-height: 1.7; }
.pfv_home_selection > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.pfv_home_selection > .pfv_button { flex: none; margin-left: auto; padding-inline: 8px; font-size: 13px; }
.pf_v2 .pfv_composer textarea { display: block; width: 100%; min-height: 103px; padding: 1px 0 10px; border: 0; box-shadow: none; outline: none; resize: vertical; border-radius: 0; background: transparent; color: var(--pfv_ink); font: inherit; line-height: 1.8; }
.pf_v2 .pfv_home_composer textarea { flex: 1 1 auto; min-height: 100px; font-size: 16px; }
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
.pfv_store_jump { display: inline-flex; align-items: center; min-height: 44px; padding: 8px 0 8px 12px; margin-left: auto; color: var(--pfv_accent); text-decoration: none; font-size: 13px; white-space: nowrap; }
.pfv_store_jump:hover { text-decoration: underline; text-underline-offset: 4px; }
.pfv_example { color: var(--pfv_muted); background: transparent; border: 0; font-size: 13px; padding-inline: 10px; font-weight: 450; }
.pfv_example:hover:not(:disabled) { color: var(--pfv_accent); background: var(--pfv_tint); }
.pfv_resume { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 12px 0; margin-top: 8px; border-top: 1px solid var(--pfv_line); }
.pfv_resume > div { min-width: 0; }
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
.pfv_current_workspace { max-width: 880px; margin: 0 auto; }
.pfv_request_summary { padding: 0 0 19px; margin-bottom: 6px; border-bottom: 1px solid var(--pfv_line); }
.pfv_request_summary > p { display: grid; grid-template-columns: 6.5em minmax(0, 1fr); align-items: baseline; gap: 12px; margin: 0; font-size: 14px; line-height: 1.75; }
.pfv_request_summary > p + p { margin-top: 5px; }
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
.pfv_outcome_document { border: 1px solid var(--pfv_line); border-radius: 20px; background: var(--pfv_paper); padding: 28px; box-shadow: 0 8px 28px color-mix(in srgb, var(--pfv_ink) 3%, transparent); }
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
  .pfv_home_start { gap: 0 28px; grid-template-columns: minmax(0, 1.6fr) minmax(230px, 1fr); }
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
.pfv_product_intro { display: grid; grid-template-columns: minmax(0,.85fr) minmax(0,1.6fr) 44px; gap: 24px; align-items: start; margin-top: 20px; margin-bottom: 16px; padding: 24px; background: var(--pfv_tint); border-radius: 14px; }
.pf_v2 .pfv_product_intro h2 { font-size: 19px; margin: 0; line-height: 1.5; }
.pfv_product_intro p { font-size: 13px; color: var(--pfv_muted); line-height: 1.8; margin-top: 8px; }
.pfv_product_intro ol { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 24px; counter-reset: intro; list-style: none; padding: 0; margin: 0; }
.pfv_product_intro li { counter-increment: intro; min-width: 0; }
.pfv_product_intro li::before { content: counter(intro); display: block; font-size: 12px; color: var(--pfv_accent); margin-bottom: 4px; }
.pfv_product_intro strong { display: block; font-size: 14px; line-height: 1.6; }
.pfv_product_intro li span { display: block; font-size: 13px; color: var(--pfv_muted); margin-top: 4px; line-height: 1.7; }
.pfv_intro_close { width: 44px; min-width: 44px; padding: 0; margin-top: -8px; margin-right: -8px; }
@container finder (max-width: 820px) { .pfv_product_intro { grid-template-columns: minmax(0,1fr) 44px; gap: 16px; } .pfv_product_intro ol { grid-column: 1 / -1; grid-row: 2; } .pfv_intro_close { grid-row: 1; grid-column: 2; } .pfv_scope_columns { grid-template-columns: minmax(0,1fr); gap: 24px; } }
@container finder (max-width: 520px) { .pfv_product_intro { padding: 16px; margin-top: 12px; } .pfv_product_intro ol { grid-template-columns: minmax(0,1fr); gap: 8px; } .pfv_product_intro li { display: flex; gap: 12px; align-items: baseline; } .pfv_product_intro li span { display: none; } .pfv_scope_footer { align-items: flex-start; flex-direction: column; } }

.pfv_opportunity .pfv_scenario_card > h3 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pfv_opportunity .pfv_scenario_card > .pfv_prose { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pfv_opportunity_controls { grid-column: 2; grid-row: 4; }

@container finder (max-width: 760px) { .pfv_opportunity_controls { grid-area: auto; margin-top: 8px; } }

/* One expert, two ways to start the same conversation. No overlay or extra nav. */
.pfv_expert_identity { display: flex; align-items: flex-start; gap: 14px; padding-top: 14px; margin-bottom: 2px; }
.pfv_expert_mark { width: 44px; height: 44px; flex: none; color: var(--pfv_accent); }
.pfv_expert_mark svg { display: block; width: 100%; height: 100%; }
.pf_v2 .pfv_expert_identity h1 { margin: 0; font-size: 24px; line-height: 1.4; letter-spacing: -.3px; font-weight: 650; color: var(--pfv_ink); }
.pfv_expert_identity p { margin: 6px 0 0; color: var(--pfv_muted); font-size: 14px; line-height: 1.7; }
.pfv_expert_identity + .pfv_home_start { padding-top: 18px; }
.pfv_expert_identity + .pfv_home_start .pfv_home_heading { font-size: 22px; line-height: 1.4; letter-spacing: -.3px; }
.pfv_expert_identity + .pfv_home_start .pfv_home_lead { font-size: 13px; margin: 8px 0 16px; line-height: 1.7; }
.pfv_expert_identity + .pfv_home_start .pfv_home_card { min-height: 216px; }
.pfv_expert_identity + .pfv_home_start .pfv_scenario_card { border-color: transparent; background: var(--pfv_tint); box-shadow: none; }
.pfv_expert_identity + .pfv_home_start .pfv_scenario_card h3 { font-size: 18px; line-height: 1.55; }
@container finder (max-width: 760px) {
  .pfv_expert_identity { gap: 12px; padding-top: 12px; margin-bottom: 6px; }
  .pfv_expert_mark { width: 36px; height: 36px; }
  .pf_v2 .pfv_expert_identity h1 { font-size: 22px; }
  .pfv_expert_identity p { font-size: 13px; }
  .pfv_expert_identity + .pfv_home_start { padding-top: 12px; }
  .pfv_expert_identity + .pfv_home_start .pfv_home_heading { font-size: 20px; }
  .pfv_expert_identity + .pfv_home_start .pfv_home_card { min-height: 208px; }
}
`;
