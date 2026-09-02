/**
 * dsh-whale-sync 浏览器端 bundle:设置面板「已归档对话」小节
 *
 * 格式说明:与 dsh 内置 client bundle 相同的 ModuleLoader 包装,
 * require("react") 从浏览器基线模块表解析。
 */
window.__ModuleLoader__.load({
	id: "dsh-whale-sync",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		let react = require("react");
		const e = react.createElement;
		const { useState, useEffect } = react;

		const STYLE = '.dws-wrap{padding:4px 2px;font-size:13px;line-height:1.5;color:var(--dsh-fg,#333)}' +
			'.dws-note{opacity:.65;margin-bottom:10px;font-size:12px}' +
			'.dws-msg{margin:8px 0;padding:6px 10px;border-radius:8px;background:rgba(0,0,0,.05);font-size:12px}' +
			'.dws-group{margin:14px 0 6px;font-weight:600;font-size:12px;opacity:.75;letter-spacing:.5px}' +
			'.dws-empty{opacity:.5;font-size:12px;margin:4px 0 10px}' +
			'.dws-row{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:10px;border:1px solid rgba(0,0,0,.08);margin:6px 0}' +
			'.dws-main{flex:1;min-width:0}' +
			'.dws-title{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
			'.dws-meta{font-size:11px;opacity:.6;margin-top:2px}' +
			'.dws-del{flex:none;border:1px solid rgba(220,60,60,.5);color:#c0392b;background:transparent;border-radius:8px;padding:4px 12px;font-size:12px;cursor:pointer}' +
			'.dws-del:hover{background:rgba(220,60,60,.08)}' +
			'.dws-del:disabled{opacity:.45;cursor:default}';

		function fmtTime(ms) {
			try { return new Date(ms).toLocaleString(); } catch { return String(ms); }
		}

		function Row(props) {
			const r = props.r;
			const [busy, setBusy] = useState(false);
			const onDel = () => {
				if (!window.confirm('确定删除会话「' + (r.title || r.id) + '」?\n数据移入 ~/.dsh/.trash(可找回),同步后其他电脑也会删除。')) return;
				setBusy(true);
				fetch('/dsh-sync/api/session/delete', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: r.id }),
				})
					.then((res) => res.json())
					.then((d) => {
						if (d && d.ok) { setMsg2('已删除「' + (r.title || r.id) + '」'); props.onDeleted(r.id); }
						else props.onMsg('✗ 删除失败: ' + ((d && d.error) || '未知错误'));
					})
					.catch((err) => props.onMsg('✗ 删除失败: ' + (err.message || err)))
					.finally(() => setBusy(false));
			};
			function setMsg2(t) { props.onMsg('✓ ' + t); }
			return e('div', { className: 'dws-row' },
				e('div', { className: 'dws-main' },
					e('div', { className: 'dws-title', title: r.id }, r.title || '(无标题)'),
					e('div', { className: 'dws-meta' }, fmtTime(r.mtimeMs) + ' · ' + r.sizeKB + 'KB' + (r.archived ? ' · 已归档' : '')),
				),
				e('button', { className: 'dws-del', disabled: busy, onClick: onDel }, busy ? '删除中…' : '删除'),
			);
		}

		function Section() {
			const [rows, setRows] = useState(null);
			const [msg, setMsg] = useState('');
			const load = () => {
				fetch('/dsh-sync/api/sessions')
					.then((res) => res.json())
					.then((d) => setRows(d.sessions || []))
					.catch((err) => { setMsg('✗ 加载失败: ' + (err.message || err)); setRows([]); });
			};
			useEffect(load, []);
			const onDeleted = (id) => setRows((rs) => (rs || []).filter((x) => x.id !== id));
			const archived = (rows || []).filter((r) => r.archived);
			const active = (rows || []).filter((r) => !r.archived);
			return e('div', { className: 'dws-wrap' },
				e('style', null, STYLE),
				e('div', { className: 'dws-note' },
					'这里可以真正删除会话(移入本地回收站 ~/.dsh/.trash,可找回);点「同步」后删除会传播到其他电脑。侧栏的「归档」只是隐藏,归档的会话也列在下面。'),
				msg ? e('div', { className: 'dws-msg' }, msg) : null,
				rows === null ? e('div', { className: 'dws-empty' }, '加载中…') : null,
				rows !== null && e(react.Fragment, null,
					e('div', { className: 'dws-group' }, '已归档(' + archived.length + ')'),
					archived.length === 0 ? e('div', { className: 'dws-empty' }, '暂无归档会话') : archived.map((r) => e(Row, { key: r.id, r, onDeleted, onMsg: setMsg })),
					e('div', { className: 'dws-group' }, '活跃会话(' + active.length + ')'),
					active.length === 0 ? e('div', { className: 'dws-empty' }, '暂无会话') : active.map((r) => e(Row, { key: r.id, r, onDeleted, onMsg: setMsg })),
				),
			);
		}

		module.exports = {
			name: 'whale-sync',
			inject: ['slots'],
			apply(ctx) {
				ctx.slots.inject('settings.section', () => ctx.slots.register({
					name: 'settings.section',
					id: 'whale-sync-archive',
					order: 400,
					label: '已归档对话',
				}, Section));
			},
		};
		return module.exports;
	}
});
