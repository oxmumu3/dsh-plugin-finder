// A small deterministic subset of constraints. Anything outside this subset is
// retained for an explicit human/model check, never reported as mechanically met.
const SOFT = /最好|尽量|优先|倾向|更希望|尽可能|如果|可以考虑|不一定|\bprefer\b|\bideally\b|\bif\s+possible\b|\bwhere\s+possible\b/i;
const KEY = /api[\s_-]*keys?|api\s*密钥|密钥|\btokens?\b|令牌/i;
const ACCOUNT = /(?:第三方|外部|额外|新的?|其他)[^，；。]{0,6}(?:账户|账号)|(?:third[- ]party|additional|extra|another)\s+accounts?/i;
const PROTECTION = /泄露|删除|展示|打印|泄漏|记录|写.{0,6}日志|写入|保存|上传|\b(?:leak|delete|display|print|log|store|upload)\b/i;
const KEY_BAN_ZH = /(?:不要|禁止|不得|不能|不允许|拒绝|无需|无须|不需要|不想|不愿意|不再|不用|不)[^，；。]{0,30}(?:api[\s_-]*keys?|api\s*密钥|密钥|\btokens?\b|令牌|(?:第三方|外部|额外|新的?|其他)[^，；。]{0,6}(?:账户|账号))/i;
const KEY_BAN_EN = /(?:\bno\b|\bwithout\b|\b(?:do|must|should)\s+not\b|\bdon['’]t\b)[^.;,]{0,45}(?:api[\s_-]*keys?|credentials?|tokens?|(?:third[- ]party|additional|extra|another)\s+accounts?)/i;
const API_BAN = /(?:不要|禁止|不得|不能|不允许|拒绝|无需|无须|不需要|不想|不愿意|不再|不用|不)[^，；。]{0,12}(?:提供|配置|申请|购买|接入|使用|开通|绑定|连接|调用)[^，；。]{0,12}(?:(?:第三方|外部|额外|独立)[^，；。]{0,6})?\bapi\b/i;
const INSTALL_BAN = /(?:不要|禁止|不得|不能|不允许|拒绝|无需|无须|不需要|不想|不愿意|不再|不)[^，；。]{0,10}(?:安装|装|新增|启用|添加)[^，；。]{0,10}插件|(?:只|仅|限定)[^，；。]{0,12}(?:dsh|宿主)?[^，；。]{0,6}原生能力|(?:\b(?:do|must|should)\s+not\b|\bdon['’]t\b|\bno\b|\bnever\b|\bwithout\b)[^.;,]{0,25}(?:install|add|enable)[^.;,]{0,15}plugins?/i;

export function extractEligibility(constraints = []) {
  if (!Array.isArray(constraints) || constraints.some(value => typeof value !== 'string')) throw new TypeError('constraints must be a string array');
  const result = { requiresNoApiKey: false, nativeOnly: false, filters: [], unresolvedConstraints: [] };
  const keyConstraints = new Set(); const nativeConstraints = new Set(); const unresolved = new Set();
  let accountOrApiCondition = false;
  for (const original of constraints) {
    if (!original.trim()) continue;
    const clauses = original.normalize('NFKC').split(/[，,；;。.!！?？]/u).map(clause => clause.trim()).filter(Boolean);
    let partiallyUnresolved = clauses.length === 0;
    for (const clause of clauses) {
      if (SOFT.test(clause)) { partiallyUnresolved = true; continue; }
      const account = ACCOUNT.test(clause);
      const api = API_BAN.test(clause) && !KEY.test(clause);
      const keyBan = !PROTECTION.test(clause) && (KEY_BAN_ZH.test(clause) || KEY_BAN_EN.test(clause) || api);
      const installBan = INSTALL_BAN.test(clause);
      if (keyBan) { result.requiresNoApiKey = true; keyConstraints.add(original); }
      if (installBan) { result.nativeOnly = true; nativeConstraints.add(original); }
      // Key metadata does not prove that no third-party account or network API
      // is required. Keep that remainder visible even after narrowing keys.
      if (!keyBan && !installBan || account || api) partiallyUnresolved = true;
      if (keyBan && (account || api)) accountOrApiCondition = true;
    }
    if (partiallyUnresolved) unresolved.add(original);
  }
  if (result.requiresNoApiKey) result.filters.push({
    key: 'requiresNoApiKey', label: '排除明确需要额外 API Key 或密钥前提未知的候选', constraints: [...keyConstraints],
    note: accountOrApiCondition
      ? 'Key 字段只能核对密钥前提，不能保证没有第三方账号、账户、联网或 API 调用；这些条件仍需确认。'
      : '仅按目录声明保留不需要额外 Key，或基础路径支持免 Key 的候选；可选功能可能另需 Key，尚未实跑。',
  });
  if (result.nativeOnly) result.filters.push({
    key: 'nativeOnly', label: '不推荐新增插件，仅保留宿主原生或供给缺口路径', constraints: [...nativeConstraints],
    note: '首版没有核对已安装插件清单；仍需确认宿主原生工具能否完成任务。',
  });
  result.unresolvedConstraints = [...unresolved];
  return result;
}
