// Exportação de relatórios: PDF (jsPDF + AutoTable), Excel (SheetJS) e impressão.
import { brl, n2, pct, fmtData, fmtDataHora, esc, imprimir, diaISO } from './util.js';
import { state, registrarLog } from './state.js';

/**
 * Estrutura de relatório:
 * { titulo, subtitulo, colunas:[{k, t, tipo:'brl'|'int'|'num'|'pct'|'data'|'dh'|'txt'}], linhas:[{}], totais:{k:valor}, resumo:[{t,v}] }
 */
export function fmtCel(tipo, v) {
  if (v === null || v === undefined || v === '') return '';
  switch (tipo) {
    case 'brl': return brl(v);
    case 'int': return String(Math.round(Number(v) || 0));
    case 'num': return n2(v);
    case 'pct': return pct(v);
    case 'data': return fmtData(v);
    case 'dh': return fmtDataHora(v);
    default: return String(v);
  }
}
const numerico = (t) => ['brl', 'int', 'num', 'pct'].includes(t);

export function tabelaHTML(rel, { limite = 0, onClickLinha = false } = {}) {
  const linhas = limite ? rel.linhas.slice(0, limite) : rel.linhas;
  if (!rel.linhas.length) return '<div class="vazio">Nenhum registro no período.</div>';
  return `<div class="tabela-wrap"><table>
    <thead><tr>${rel.colunas.map((c) => `<th class="${numerico(c.tipo) ? 'num' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead>
    <tbody>${linhas.map((l, i) => `<tr class="${onClickLinha ? 'clicavel' : ''} ${l._cls || ''}" data-i="${i}">${rel.colunas.map((c) => `<td class="${numerico(c.tipo) ? 'num' : ''}">${esc(fmtCel(c.tipo, l[c.k]))}</td>`).join('')}</tr>`).join('')}</tbody>
    ${rel.totais ? `<tfoot><tr>${rel.colunas.map((c, i) => `<td class="${numerico(c.tipo) ? 'num' : ''}">${i === 0 && rel.totais[c.k] === undefined ? 'TOTAL' : esc(fmtCel(c.tipo, rel.totais[c.k]))}</td>`).join('')}</tr></tfoot>` : ''}
  </table></div>`;
}

let logoCache = null;
async function logoDataURL() {
  if (logoCache) return logoCache;
  try {
    const blob = await (await fetch('assets/logo.jpg')).blob();
    logoCache = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  } catch { logoCache = ''; }
  return logoCache;
}

const nomeArquivo = (t) => `${t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').toLowerCase()}_${diaISO()}`;

export async function exportarPDF(rel) {
  const { jsPDF } = window.jspdf;
  const largo = rel.colunas.length > 6;
  const doc = new jsPDF({ orientation: largo ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const logo = await logoDataURL();
  if (logo) doc.addImage(logo, 'JPEG', 12, 8, 18, 18);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(state.config.nome || 'Encanto Espacial', 34, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100);
  doc.text(state.config.slogan || '', 34, 19);
  doc.text(`Emitido em ${fmtDataHora(Date.now())}`, W - 12, 14, { align: 'right' });
  doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(rel.titulo, 12, 34);
  let y = 39;
  if (rel.subtitulo) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(rel.subtitulo, 12, y); y += 5; }
  if (rel.resumo?.length) {
    doc.setFontSize(9);
    const txt = rel.resumo.map((r) => `${r.t}: ${r.v}`).join('   •   ');
    const linhas = doc.splitTextToSize(txt, W - 24);
    doc.text(linhas, 12, y); y += linhas.length * 4.5 + 1;
  }
  const alin = {};
  rel.colunas.forEach((c, i) => { if (numerico(c.tipo)) alin[i] = { halign: 'right' }; });
  doc.autoTable({
    startY: y + 1,
    head: [rel.colunas.map((c) => c.t)],
    body: rel.linhas.map((l) => rel.colunas.map((c) => fmtCel(c.tipo, l[c.k]))),
    foot: rel.totais ? [rel.colunas.map((c, i) => (i === 0 && rel.totais[c.k] === undefined ? 'TOTAL' : fmtCel(c.tipo, rel.totais[c.k])))] : undefined,
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [11, 16, 38], textColor: 255 },
    footStyles: { fillColor: [214, 247, 239], textColor: 20, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 252] },
    columnStyles: alin,
    margin: { left: 12, right: 12 },
    didDrawPage: () => {
      doc.setFontSize(8); doc.setTextColor(130);
      doc.text(`Página ${doc.internal.getNumberOfPages()}`, W - 12, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
    }
  });
  doc.save(`${nomeArquivo(rel.titulo)}.pdf`);
  registrarLog('relatorio', `Exportou PDF: ${rel.titulo}${rel.subtitulo ? ` – ${rel.subtitulo}` : ''}`);
}

export function exportarXLSX(rel) {
  const X = window.XLSX;
  const valor = (c, v) => {
    if (v === null || v === undefined) return '';
    if (c.tipo === 'data' || c.tipo === 'dh') return v ? new Date(v) : '';
    if (numerico(c.tipo)) return Number(v) || 0;
    return v;
  };
  const aoa = [[rel.titulo], rel.subtitulo ? [rel.subtitulo] : [], [], rel.colunas.map((c) => c.t),
    ...rel.linhas.map((l) => rel.colunas.map((c) => valor(c, l[c.k])))];
  if (rel.totais) aoa.push(rel.colunas.map((c, i) => (i === 0 && rel.totais[c.k] === undefined ? 'TOTAL' : valor(c, rel.totais[c.k]))));
  const ws = X.utils.aoa_to_sheet(aoa, { cellDates: true });
  ws['!cols'] = rel.colunas.map((c) => ({ wch: c.tipo === 'txt' || !c.tipo ? 28 : 14 }));
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Relatório');
  X.writeFile(wb, `${nomeArquivo(rel.titulo)}.xlsx`);
  registrarLog('relatorio', `Exportou Excel: ${rel.titulo}${rel.subtitulo ? ` – ${rel.subtitulo}` : ''}`);
}

export function imprimirRelatorio(rel) {
  registrarLog('relatorio', `Imprimiu: ${rel.titulo}${rel.subtitulo ? ` – ${rel.subtitulo}` : ''}`);
  imprimir(`<div style="font-family:Arial,sans-serif;color:#000">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <img src="assets/logo.jpg" style="width:48px;height:48px;border-radius:50%">
      <div><b style="font-size:14pt">${esc(state.config.nome)}</b><br><small>${esc(state.config.slogan || '')}</small></div>
      <small style="margin-left:auto">Emitido em ${esc(fmtDataHora(Date.now()))}</small>
    </div>
    <h2 style="margin:6px 0 2px">${esc(rel.titulo)}</h2>
    ${rel.subtitulo ? `<div>${esc(rel.subtitulo)}</div>` : ''}
    ${rel.resumo?.length ? `<p style="font-size:9pt">${rel.resumo.map((r) => `<b>${esc(r.t)}:</b> ${esc(r.v)}`).join(' &nbsp;•&nbsp; ')}</p>` : ''}
    <div style="font-size:8.5pt">${tabelaHTML(rel)}</div></div>`, '@page { size: A4; margin: 10mm; }');
}
