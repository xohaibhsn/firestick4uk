"use client";

type Field = { key: string; label: string; wide?: boolean };

export default function RepeatableEditor({
  items,
  fields,
  onChange,
}: {
  items: Record<string, string>[];
  fields: Field[];
  onChange: (next: Record<string, string>[]) => void;
}) {
  const list = Array.isArray(items) ? items : [];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {list.map((item, i) => (
        <div key={i} style={{border:"1px solid #E5E5E5",borderRadius:10,padding:12,background:"#FAFAFA"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <strong style={{fontSize:12}}>Item {i + 1}</strong>
            <button type="button" className="action-btn btn-delete" onClick={() => onChange(list.filter((_, j) => j !== i))}>Remove</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {fields.map((f) => (
              <div key={f.key} className="modal-field" style={{gridColumn: f.wide ? "1 / -1" : undefined, marginBottom:0}}>
                <label>{f.label}</label>
                {f.wide ? (
                  <textarea rows={2} style={{width:"100%",resize:"vertical"}} value={item[f.key] || ""} onChange={(e) => onChange(list.map((x, j) => j === i ? { ...x, [f.key]: e.target.value } : x))} />
                ) : (
                  <input style={{width:"100%"}} value={item[f.key] || ""} onChange={(e) => onChange(list.map((x, j) => j === i ? { ...x, [f.key]: e.target.value } : x))} />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="action-btn btn-view"
        onClick={() => {
          const blank: Record<string, string> = {};
          fields.forEach((f) => { blank[f.key] = ""; });
          onChange([...list, blank]);
        }}
      >
        + Add item
      </button>
    </div>
  );
}
