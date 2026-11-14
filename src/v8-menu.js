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

/** Light-dismiss fallback only when <dialog closedby="any"> is unsupported natively. */
export function attachDialogLightDismiss(dialog, onDismiss) {
  if (!dialog || (typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype)) {
    return () => {};
  }
  const outside = event => {
    const r = dialog.getBoundingClientRect?.();
    if (!r) return false;
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  };
  let pressedOutside = false;
  const onDown = event => { pressedOutside = outside(event); };
  const onUp = event => {
    if (pressedOutside && outside(event)) {
      pressedOutside = false;
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      onDismiss?.();
    }
  };
  dialog.addEventListener?.('pointerdown', onDown);
  dialog.addEventListener?.('pointerup', onUp);
  return () => {
    dialog.removeEventListener?.('pointerdown', onDown);
    dialog.removeEventListener?.('pointerup', onUp);
  };
}

/** 原生 <dialog closedby="any"> 确认框：复用宿主顶部栈与 Esc/点外关闭，不自造遮罩或 focus trap。 */
export function createConfirmDialog(React) {
  const h = React.createElement;
  return function ConfirmDialog({ modal, workspaceId = '', workspaces = [], onSelectWorkspace, onDismiss }) {
    const dialogRef = React.useRef(null);
    const closedByAction = React.useRef('');

    React.useEffect(() => {
      const dialog = dialogRef.current;
      if (!modal || !dialog) return undefined;
      closedByAction.current = '';
      dialog.setAttribute?.('closedby', 'any');
      if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
      const detach = attachDialogLightDismiss(dialog, () => {
        if (closedByAction.current === 'confirm') return;
        onDismiss?.();
      });
      return () => {
        detach?.();
        if (dialog.open && typeof dialog.close === 'function') dialog.close();
      };
    }, [modal]);

    if (!modal) return null;
    const facts = Array.isArray(modal.facts) ? modal.facts.filter(item => item && item.label && item.value) : [];
    const needWorkspace = Boolean(modal.requireWorkspace) && Array.isArray(workspaces) && workspaces.length > 0 && !workspaceId;

    const finishCancel = () => {
      closedByAction.current = 'cancel';
      const dialog = dialogRef.current;
      if (dialog) dialog.returnValue = '';
      if (dialog?.open && typeof dialog.close === 'function') dialog.close('cancel');
      onDismiss?.();
    };

    const finishConfirm = () => {
      if (needWorkspace) return;
      closedByAction.current = 'confirm';
      const dialog = dialogRef.current;
      if (dialog) dialog.returnValue = '';
      if (dialog?.open && typeof dialog.close === 'function') dialog.close('confirm');
      onDismiss?.();
      modal.onConfirm?.();
    };

    return h('dialog', {
      ref: dialogRef,
      className: 'pf_modal pf_v8',
      closedby: 'any',
      'aria-labelledby': 'pf_modal_title',
      onClose: event => {
        const dialog = event?.currentTarget || dialogRef.current;
        const rv = dialog?.returnValue || '';
        if (dialog) dialog.returnValue = '';
        if (closedByAction.current === 'confirm' || rv === 'confirm') return;
        onDismiss?.();
      },
    },
    h('div', { className: 'pf_modal_head' },
      h('h2', { id: 'pf_modal_title' }, modal.title || '确认继续'),
      h('button', { type: 'button', className: 'pf_modal_x', 'aria-label': '关闭对话框', onClick: finishCancel }, '×')),
    modal.body ? h('p', { className: 'pf_modal_body' }, modal.body) : null,
    facts.length ? h('dl', { className: 'pf_modal_facts' },
      ...facts.map(item => h('div', { key: item.label }, h('dt', null, item.label), h('dd', null, item.value)))) : null,
    modal.showWorkspacePicker && Array.isArray(workspaces) && workspaces.length ? h('label', { className: 'pf_modal_ws' },
      '在哪个工作区执行',
      h('select', {
        'aria-label': '确认弹窗中的工作区选择',
        value: workspaceId || '',
        onChange: event => onSelectWorkspace?.(event.target.value),
      },
      h('option', { value: '' }, '选择目标工作区'),
      ...workspaces.map(item => h('option', { key: item.workspaceId, value: item.workspaceId }, item.title)))) : null,
    h('div', { className: 'pf_modal_acts' },
      h('button', { type: 'button', className: 'pf8_btn', autoFocus: true, onClick: finishCancel }, modal.cancelLabel || '先取消'),
      h('button', { type: 'button', className: 'pf8_btn pf8_ink', disabled: needWorkspace, onClick: finishConfirm }, modal.confirmLabel || '确认继续')));
  };
}
