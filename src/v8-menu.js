// v8 顶栏最右边的「更多」：面板原来的三个动作都收在这里，外观仍是文字链接。
// 面板和渲染脚本共用这一份，避免截图里的顶部和真实顶部长得不一样。
// 类名用 pf8_topmore，不和首页「也可以逛逛插件商店」那句的 pf8_more 撞。
export function createMoreMenu(React) {
  const h = React.createElement;
  return function MoreMenu({ controller, busy = false, onTelemetry, onImport }) {
    const node = React.useRef(null);
    // 选完一项就收起，焦点回到「更多」，Esc 同样收起。
    const close = () => {
      const menu = node?.current;
      if (!menu) return;
      menu.open = false;
      menu.querySelector?.('summary')?.focus?.();
    };
    const pick = action => () => { action?.(); close(); };
    return h('details', {
      className: 'pf8_topmore', ref: node,
      onKeyDown: event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } },
    },
    h('summary', { className: 'pf8_lk' }, '更多'),
    h('div', { className: 'pf8_topmore_menu' },
      h('button', { type: 'button', className: 'pf8_topmore_item', onClick: pick(() => controller?.bootstrap?.()), disabled: busy }, '重新读取配置'),
      h('button', { type: 'button', className: 'pf8_topmore_item', onClick: pick(onTelemetry) }, '回传设置'),
      h('button', { type: 'button', className: 'pf8_topmore_item', onClick: pick(onImport), disabled: busy }, '导入本机备份')));
  };
}
