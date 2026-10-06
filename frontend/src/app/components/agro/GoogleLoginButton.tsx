import { useEffect, useRef, useState } from 'react';

/**
 * Botão "Entrar com Google" via Google Identity Services (GIS).
 * O Google devolve um ID token (`credential`) que o backend valida em POST /auth/google.
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GIS_SRC = 'https://accounts.google.com/gsi/client';

type GoogleCredentialResponse = { credential: string };

type GoogleIdentity = {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        ux_mode?: 'popup' | 'redirect';
      }): void;
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
    };
  };
};

declare global {
  interface Window { google?: GoogleIdentity }
}

// O GIS deve ser inicializado uma única vez por página: o callback global
// repassa a credencial para o botão montado no momento.
let credentialHandler: ((credential: string) => void) | null = null;
let gisInitialized = false;

function initGis(google: GoogleIdentity) {
  if (gisInitialized) return;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID!,
    callback: ({ credential }) => credentialHandler?.(credential),
    ux_mode: 'popup',
  });
  gisInitialized = true;
}

// Carrega o script do GIS uma única vez, compartilhado entre montagens.
let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisPromise = null;
      reject(new Error('Falha ao carregar o Google Identity Services.'));
    };
    document.head.appendChild(script);
  });
  return gisPromise;
}

type GoogleLoginButtonProps = {
  onCredential: (credential: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
};

export function GoogleLoginButton({ onCredential, text = 'continue_with' }: GoogleLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // O callback do GIS é registrado uma vez; aponta sempre para o handler atual.
  useEffect(() => {
    credentialHandler = onCredential;
    return () => {
      if (credentialHandler === onCredential) credentialHandler = null;
    };
  }, [onCredential]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;

    loadGis()
      .then(() => {
        const container = containerRef.current;
        if (cancelled || !container || !window.google) return;
        initGis(window.google);
        container.innerHTML = '';
        window.google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text,
          logo_alignment: 'center',
          width: Math.min(container.offsetWidth || 380, 400),
        });
      })
      .catch(() => !cancelled && setFailed(true));

    return () => { cancelled = true; };
  }, [text]);

  if (!GOOGLE_CLIENT_ID) return null;

  if (failed) {
    return (
      <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '12px' }}>
        Login com Google indisponível no momento.
      </p>
    );
  }

  return <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center', minHeight: '44px' }} />;
}
