/**
 * @file FormFields.tsx
 * @description Campos de formulário no visual escuro do AgroMundo,
 * compartilhados entre AuthPage e ProfilePage.
 */

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

export const labelStyle: React.CSSProperties = {
  fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '6px', display: 'block',
};

export const fieldBoxStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(74,250,130,0.15)',
  borderRadius: '10px', overflow: 'hidden',
  transition: 'border-color 0.2s',
};

export const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
  padding: '12px 12px 12px 0', color: '#fff', fontSize: '14px',
  fontFamily: "'Inter', sans-serif",
};

export const linkButtonStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#4afa82',
  fontSize: '13px', cursor: 'pointer',
};

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '12px', color: '#4afa82', fontWeight: 600, letterSpacing: '1px',
      textTransform: 'uppercase', paddingTop: '8px',
      borderTop: '1px solid rgba(74,250,130,0.1)',
    }}>
      {children}
    </div>
  );
}

export function FormField({
  label, icon, placeholder, type = 'text', value, onChange, required, inputMode, autoComplete,
}: {
  label: string; icon: React.ReactNode; placeholder: string;
  type?: string; value: string; onChange: (v: string) => void; required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={fieldBoxStyle}>
        <div style={{ padding: '0 12px', color: 'rgba(255,255,255,0.3)' }}>{icon}</div>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          required={required}
          inputMode={inputMode}
          autoComplete={autoComplete}
          style={inputStyle}
        />
      </div>
    </div>
  );
}

export function SelectField({
  label, value, onChange, required, children,
}: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        style={{
          ...fieldBoxStyle, width: '100%', padding: '12px 10px',
          color: '#fff', fontSize: '14px', outline: 'none', cursor: 'pointer',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {children}
      </select>
    </div>
  );
}
