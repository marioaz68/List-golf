'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
const money = n => (Number(n)||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});

export default function Productos(){
  const [rows,setRows]=useState([]);
  const [msg,setMsg]=useState('');
  const [g,setG]=useState(false);
  const [erpBusy,setErpBusy]=useState(false);
  const [empresa,setEmpresa]=useState('constramos');
  const [erpMsg,setErpMsg]=useState('');

  useEffect(()=>{ (async()=>{
    if(!supabase) return;
    const { data } = await supabase.from('cot_conceptos').select('id,numero,codigo,codigo_merque,codigo_rogmai,nombre,um,precio_venta_1,precio_venta_2,precio_venta_3').eq('activo',true).order('numero');
    setRows(data||[]);
  })(); },[]);

  const upd=(id,k,v)=>setRows(rs=>rs.map(r=>r.id===id?{...r,[k]:v}:r));

  async function guardar(){
    setG(true); setMsg('');
    try{
      for(const r of rows){
        await supabase.from('cot_conceptos').update({
          codigo:r.codigo, codigo_merque:r.codigo_merque, codigo_rogmai:r.codigo_rogmai, um:r.um,
          precio_venta_1:Number(r.precio_venta_1)||0,
          precio_venta_2:Number(r.precio_venta_2)||0,
          precio_venta_3:Number(r.precio_venta_3)||0,
        }).eq('id',r.id);
      }
      setMsg('✓ Precios guardados en cotizador');
    }catch(e){ setMsg('Error: '+(e.message||e)); }
    finally{ setG(false); }
  }

  /** Run: alta de listas N1/N2/N3 en salesprices del ERP (solo venta). */
  async function subirAlErp({ dryRun=false }={}){
    if(!supabase?.erpPost){
      setErpMsg('Error: cliente ERP no disponible (erpPost).');
      return;
    }
    const label = empresa === 'constramos' ? 'Constramos' : empresa === 'rogmai' ? 'Rogmai' : 'Merque';
    if(!dryRun && !window.confirm(
      `¿Subir listas de precios N1/N2/N3 de ${label} al ERP?\n\n` +
      `Solo precios de venta. No se envían costos APU.\n` +
      `Se escribe en salesprices (stockid = código de la empresa).`
    )) return;

    setErpBusy(true); setErpMsg('');
    try{
      // Guardar primero en cotizador para no subir datos desactualizados.
      if(!dryRun){
        for(const r of rows){
          await supabase.from('cot_conceptos').update({
            codigo:r.codigo, codigo_merque:r.codigo_merque, codigo_rogmai:r.codigo_rogmai, um:r.um,
            precio_venta_1:Number(r.precio_venta_1)||0,
            precio_venta_2:Number(r.precio_venta_2)||0,
            precio_venta_3:Number(r.precio_venta_3)||0,
          }).eq('id',r.id);
        }
      }
      const res = await supabase.erpPost('erp/guardar-precios.php', {
        empresa,
        dry_run: !!dryRun,
      });
      if(!res?.ok) throw new Error(res?.error || 'Error al subir listas');
      const s = res.stats || {};
      const listas = res.listas
        ? ` · Listas ERP: ${[1,2,3].map(n=>`${n}=${res.listas[n]?.typeabbrev||'?'}`).join(', ')}`
        : '';
      setErpMsg(
        (dryRun ? 'Simulación · ' : '✓ ') +
        (res.mensaje || 'OK') +
        ` · altas ${s.inserted||0} · act. ${s.updated||0} · igual ${s.same||0}` +
        ` · sin código ${s.skipped_no_code||0} · sin stock ${s.skipped_no_stock||0}` +
        listas
      );
    }catch(e){
      setErpMsg('Error: '+(e.message||e));
    }finally{
      setErpBusy(false);
    }
  }

  return (
    <div>
      <p className="hint">Precios de venta por nivel de volumen (N1: 0–3,000 · N2: 3,001–6,000 · N3: 6,001+ m²). Los costos APU no se suben al ERP.</p>
      <table><thead><tr><th>#</th><th>Cód. comercial<br/><small>Constramos</small></th><th>Cód. Merque</th><th>Cód. Rogmai</th><th>Concepto</th><th>UM</th><th className="num">Precio N1</th><th className="num">Precio N2</th><th className="num">Precio N3</th></tr></thead>
        <tbody>{rows.map(r=>(<tr key={r.id}>
          <td>{r.numero}</td>
          <td><input style={{width:120}} value={r.codigo||''} onChange={e=>upd(r.id,'codigo',e.target.value)} /></td>
          <td><input style={{width:140}} value={r.codigo_merque||''} onChange={e=>upd(r.id,'codigo_merque',e.target.value)} /></td>
          <td><input style={{width:120}} value={r.codigo_rogmai||''} onChange={e=>upd(r.id,'codigo_rogmai',e.target.value)} /></td>
          <td>{r.nombre}</td>
          <td><input style={{width:60}} value={r.um||''} onChange={e=>upd(r.id,'um',e.target.value)} /></td>
          <td className="num"><input type="number" step="0.01" style={{width:90,textAlign:'right'}} value={r.precio_venta_1??''} onChange={e=>upd(r.id,'precio_venta_1',e.target.value)} /></td>
          <td className="num"><input type="number" step="0.01" style={{width:90,textAlign:'right'}} value={r.precio_venta_2??''} onChange={e=>upd(r.id,'precio_venta_2',e.target.value)} /></td>
          <td className="num"><input type="number" step="0.01" style={{width:90,textAlign:'right'}} value={r.precio_venta_3??''} onChange={e=>upd(r.id,'precio_venta_3',e.target.value)} /></td>
        </tr>))}</tbody>
      </table>

      <p style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center',marginTop:14}}>
        <button onClick={guardar} disabled={g||erpBusy}>{g?'Guardando…':'Guardar precios'}</button>
        {msg && <span style={{color:msg.startsWith('✓')?'#1a7f37':'#b8341b'}}>{msg}</span>}
      </p>

      <div style={{marginTop:18,padding:'12px 14px',border:'1px solid #e5e2df',borderRadius:8,background:'#faf9f7'}}>
        <strong>Run · Alta de listas en el ERP</strong>
        <p className="hint" style={{margin:'6px 0 10px'}}>
          Escribe N1/N2/N3 en <code>salesprices</code> del ERP (por stockid). Primero guarda en cotizador y luego sube.
        </p>
        <div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center'}}>
          <label>
            Empresa{' '}
            <select value={empresa} onChange={e=>setEmpresa(e.target.value)} disabled={erpBusy}>
              <option value="constramos">Constramos (cód. comercial)</option>
              <option value="rogmai">Rogmai (cód. Rogmai)</option>
              <option value="merque">Merque (cód. Merque)</option>
            </select>
          </label>
          <button type="button" onClick={()=>subirAlErp({dryRun:true})} disabled={erpBusy||g}>
            {erpBusy?'…':'Simular'}
          </button>
          <button type="button" onClick={()=>subirAlErp({dryRun:false})} disabled={erpBusy||g}
            style={{fontWeight:600}}>
            {erpBusy?'Subiendo…':'▶ Run · Subir listas al ERP'}
          </button>
        </div>
        {erpMsg && (
          <p style={{marginTop:10,color:erpMsg.startsWith('Error')?'#b8341b':'#1a7f37',fontSize:13}}>
            {erpMsg}
          </p>
        )}
      </div>
    </div>
  );
}
