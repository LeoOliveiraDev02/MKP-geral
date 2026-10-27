/**
 * @file seed.js (src/db)
 * @description Popula o banco com anúncios de demonstração, alguns por categoria.
 *
 * - Roda com a conexão ADMIN (dona das tabelas), como o seed de categorias do boot.
 * - Cria um vendedor demo (`DEMO_EMAIL`) com dois endereços (urbano e rural) e
 *   anúncios ATIVOS com imagem principal hospedada no Unsplash.
 * - Idempotente: se o vendedor demo já existir, não recria os anúncios.
 * - Complemento do marketplace (também idempotente, roda sempre): unidade,
 *   estoque, peso, atacado e ofertas nos anúncios demo que ainda não foram
 *   configurados; coordenadas dos endereços demo (Pouso Alegre/MG);
 *   apresentação do produtor; uma cesta por assinatura; e as contas de teste
 *   do cliente (`CLIENTE_EMAIL`) e do administrador (`ADMIN_EMAIL`, que deve
 *   estar em ADMIN_EMAILS no .env).
 *
 * Uso: `npm run db:seed`
 */

require('dotenv').config();

// Contas demo com senha conhecida (inclusive um admin) nunca vão para produção.
if (process.env.NODE_ENV === 'production') {
  console.error('db:seed bloqueado em produção: cria contas demo com senhas públicas.');
  process.exit(1);
}

const { hashSenha } = require('../utils/senha');
const { Client } = require('pg');
const { initializeDatabase, closeDatabase } = require('./index');

const DEMO_EMAIL = 'produtor.demo@agrostand.com';
const DEMO_SENHA = 'Demo@1234';
const CLIENTE_EMAIL = 'cliente.demo@agrostand.com';
const CLIENTE_SENHA = 'Cliente@1234';
const ADMIN_EMAIL = 'admin.demo@agrostand.com';
const ADMIN_SENHA = 'Admin@1234';

// Coordenadas aproximadas de Pouso Alegre/MG (centro e zona rural)
const COORD_URBANA = { latitude: -22.2302, longitude: -45.9364 };
const COORD_RURAL = { latitude: -22.2668, longitude: -45.902 };

/** Configuração de venda por anúncio demo: [unidade, peso_kg, estoque, atacado?, promoção?]. */
const VENDA_DEMO = {
  'Morango orgânico': ['bandeja', 0.25, 40, null, { preco: 10.9, dias: 15 }],
  'Banana prata': ['dz', 1.5, 30],
  'Laranja pera': ['kg', 1, 200, { min: 20, preco: 4.2 }],
  'Manga palmer': ['kg', 1, 120],
  Melancia: ['un', 8, 15],
  'Tomate italiano': ['kg', 1, 150, { min: 10, preco: 7.5 }],
  Cenoura: ['kg', 1, 100],
  'Batata inglesa': ['kg', 1, 300, { min: 20, preco: 5.2 }],
  'Abóbora cabotiá': ['kg', 1, 80],
  'Alface crespa': ['pe', 0.3, 60],
  'Couve manteiga': ['maco', 0.3, 50],
  Espinafre: ['maco', 0.3, 40],
  'Milho verde': ['un', 3, 25],
  'Arroz agulhinha': ['un', 5, 40],
  'Grão-de-bico': ['un', 1, 35],
  'Café em grãos torrado': ['un', 0.5, 60, { min: 10, preco: 38 }, { preco: 37.9, dias: null }],
  'Ovos caipira': ['bandeja', 0.7, 50, { min: 10, preco: 13.5 }],
  'Queijo minas artesanal': ['kg', 1, 12, { min: 5, preco: 40 }],
};

async function garantirUsuario(admin, { email, senha, nome, sobrenome, telefone, endereco }) {
  const existente = await admin.query('SELECT id FROM "Usuario" WHERE email = $1', [email]);
  if (existente.rowCount) return { id: existente.rows[0].id, criado: false };
  const senhaHash = await hashSenha(senha);
  const { rows: [u] } = await admin.query(
    `INSERT INTO "Usuario" (nome, sobrenome, email, telefone, senha_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [nome, sobrenome, email, telefone, senhaHash]
  );
  if (endereco) {
    await admin.query(
      `INSERT INTO "Endereco" (cliente_id, rua, numero, bairro, cep, cidade, uf, zona, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [u.id, endereco.rua, endereco.numero, endereco.bairro, endereco.cep, endereco.cidade, endereco.uf, endereco.zona,
        endereco.latitude, endereco.longitude]
    );
  }
  return { id: u.id, criado: true };
}

/** Complemento idempotente dos dados demo para as funcionalidades do marketplace. */
async function complementar(admin) {
  const { rows: [vendedor] } = await admin.query('SELECT id, bio FROM "Usuario" WHERE email = $1', [DEMO_EMAIL]);
  if (!vendedor) return;

  // Coordenadas dos endereços demo que ainda não têm
  await admin.query(
    `UPDATE "Endereco" SET latitude = CASE WHEN zona = 'RURAL' THEN $2::float ELSE $4::float END,
                           longitude = CASE WHEN zona = 'RURAL' THEN $3::float ELSE $5::float END
     WHERE cliente_id = $1 AND latitude IS NULL`,
    [vendedor.id, COORD_RURAL.latitude, COORD_RURAL.longitude, COORD_URBANA.latitude, COORD_URBANA.longitude]
  );

  // Venda: só nos anúncios que ainda estão no padrão (un, sem estoque)
  let configurados = 0;
  for (const [nome, [unidade, peso, estoque, atacado, promo]] of Object.entries(VENDA_DEMO)) {
    const { rows } = await admin.query(
      `UPDATE "Anuncio" SET unidade = $3, peso_kg = $4, estoque = $5,
         preco_promocional = $6,
         promocao_ate = $7
       WHERE anunciante_id = $1 AND nome = $2 AND unidade = 'un' AND estoque IS NULL
       RETURNING id`,
      [vendedor.id, nome, unidade, peso, estoque, promo ? promo.preco : null,
        promo && promo.dias ? new Date(Date.now() + promo.dias * 86400000).toISOString().slice(0, 10) : null]
    );
    if (!rows.length) continue;
    configurados++;
    if (atacado) {
      await admin.query(
        `INSERT INTO "PrecoAtacado" (anuncio_id, quantidade_minima, preco) VALUES ($1, $2, $3)
         ON CONFLICT (anuncio_id, quantidade_minima) DO NOTHING`,
        [rows[0].id, atacado.min, atacado.preco]
      );
    }
  }

  if (!vendedor.bio) {
    await admin.query(
      `UPDATE "Usuario" SET bio = $2 WHERE id = $1`,
      [vendedor.id, 'Sítio familiar em Pouso Alegre/MG (conta de demonstração do ambiente de teste). Frutas, legumes, verduras, ovos caipira e queijo curado, com colheita e entrega na mesma semana.']
    );
  }

  const cesta = await admin.query('SELECT 1 FROM "Cesta" WHERE vendedor_id = $1', [vendedor.id]);
  if (!cesta.rowCount) {
    await admin.query(
      `INSERT INTO "Cesta" (vendedor_id, nome, descricao, itens, preco, frequencia, imagem_url)
       VALUES ($1, 'Cesta da semana', 'Seleção de verduras, legumes e frutas da estação, colhidos na véspera da entrega.',
               'Alface, couve, cenoura 1 kg, tomate 1 kg, banana (1 dz), 6 ovos caipira', 59.9, 'SEMANAL', $2)`,
      [vendedor.id, img('1488459716781-31db52582fe9')]
    );
  }

  const cliente = await garantirUsuario(admin, {
    email: CLIENTE_EMAIL, senha: CLIENTE_SENHA, nome: 'Maria', sobrenome: 'Cliente', telefone: '(35) 98888-0001',
    endereco: { rua: 'Avenida Dr. Lisboa', numero: '250', bairro: 'Centro', cep: '37550-000', cidade: 'Pouso Alegre', uf: 'MG', zona: 'URBANA', ...COORD_URBANA },
  });
  const adm = await garantirUsuario(admin, {
    email: ADMIN_EMAIL, senha: ADMIN_SENHA, nome: 'Admin', sobrenome: 'AgroMundo', telefone: '(35) 98888-0002',
  });

  console.log(`Complemento: ${configurados} anúncio(s) configurados com unidade/estoque.`);
  console.log(`Cliente de teste: ${CLIENTE_EMAIL} / ${CLIENTE_SENHA}${cliente.criado ? ' (criado)' : ''}`);
  console.log(`Administrador de teste: ${ADMIN_EMAIL} / ${ADMIN_SENHA}${adm.criado ? ' (criado)' : ''} — precisa estar em ADMIN_EMAILS.`);
}

const img = (id) => `https://images.unsplash.com/photo-${id}?w=800&q=80`;

/** Produtos por nome de categoria (as do seed padrão em `initializeDatabase`). */
const PRODUTOS = {
  Frutas: [
    { nome: 'Morango orgânico', preco: 12.9, imagem: img('1464965911861-746a04b4bca6'), rural: true,
      descricao: 'Morangos orgânicos colhidos no dia, doces e firmes. Bandeja de 250 g.' },
    { nome: 'Banana prata', preco: 6.5, imagem: img('1571771894821-ce9b6c11b08e'), rural: true,
      descricao: 'Banana prata madura no ponto, cultivada sem agrotóxicos. Preço por dúzia.' },
    { nome: 'Laranja pera', preco: 4.8, imagem: img('1547514701-42782101795e'), rural: true,
      descricao: 'Laranja pera suculenta, ideal para suco. Preço por kg.' },
    { nome: 'Manga palmer', preco: 7.9, imagem: img('1553279768-865429fa0078'), rural: true,
      descricao: 'Manga palmer de polpa firme e sem fibras. Preço por kg.' },
    { nome: 'Melancia', preco: 18.0, imagem: img('1587049352846-4a222e784d38'), rural: true,
      descricao: 'Melancia doce e bem vermelha, unidade de aproximadamente 8 kg.' },
  ],
  Legumes: [
    { nome: 'Tomate italiano', preco: 8.5, imagem: img('1546094096-0df4bcaaa337'), rural: true,
      descricao: 'Tomate italiano maduro, ótimo para molhos. Preço por kg.' },
    { nome: 'Cenoura', preco: 5.2, imagem: img('1598170845058-32b9d6a5da37'), rural: true,
      descricao: 'Cenoura fresca com rama, colhida na semana. Preço por kg.' },
    { nome: 'Batata inglesa', preco: 6.0, imagem: img('1518977676601-b53f82aba655'), rural: true,
      descricao: 'Batata inglesa lavada, boa para fritar e cozinhar. Preço por kg.' },
    { nome: 'Abóbora cabotiá', preco: 4.5, imagem: img('1570586437263-ab629fccc818'), rural: true,
      descricao: 'Abóbora cabotiá de casca firme e polpa adocicada. Preço por kg.' },
  ],
  Verduras: [
    { nome: 'Alface crespa', preco: 3.5, imagem: img('1622206151226-18ca2c9ab4a1'), rural: false,
      descricao: 'Alface crespa hidropônica, folhas limpas e crocantes. Preço por pé.' },
    { nome: 'Couve manteiga', preco: 4.0, imagem: img('1524179091875-bf99a9a6af57'), rural: false,
      descricao: 'Maço de couve manteiga fresquinha, colhida no dia.' },
    { nome: 'Espinafre', preco: 5.5, imagem: img('1576045057995-568f588f82fb'), rural: false,
      descricao: 'Maço de espinafre com folhas grandes e viçosas.' },
  ],
  Grãos: [
    { nome: 'Milho verde', preco: 10.0, imagem: img('1551754655-cd27e38d2076'), rural: true,
      descricao: 'Milho verde na palha, ideal para pamonha e curau. Pacote com 10 espigas.' },
    { nome: 'Arroz agulhinha', preco: 28.9, imagem: img('1586201375761-83865001e31c'), rural: true,
      descricao: 'Arroz agulhinha tipo 1 da safra atual. Saco de 5 kg.' },
    { nome: 'Grão-de-bico', preco: 16.5, imagem: img('1515543904379-3d757afe72e4'), rural: true,
      descricao: 'Grão-de-bico selecionado, cozimento rápido. Pacote de 1 kg.' },
    { nome: 'Café em grãos torrado', preco: 42.0, imagem: img('1559056199-641a0ac8b55e'), rural: true,
      descricao: 'Café arábica de altitude, torra média. Pacote de 500 g.' },
  ],
  Outros: [
    { nome: 'Ovos caipira', preco: 15.0, imagem: img('1582722872445-44dc5f7e3c8f'), rural: true,
      descricao: 'Ovos caipira de galinhas criadas soltas. Bandeja com 12 unidades.' },
    { nome: 'Queijo minas artesanal', preco: 45.0, imagem: img('1486297678162-eb2a19b0a32d'), rural: true,
      descricao: 'Queijo minas curado artesanal, peça de aproximadamente 1 kg.' },
  ],
};

async function seed() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL não definida.');

  // Garante tabelas, policies e categorias padrão
  await initializeDatabase();

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const existe = await admin.query('SELECT 1 FROM "Usuario" WHERE email = $1', [DEMO_EMAIL]);
    if (existe.rowCount) {
      console.log(`Anúncios demo já existem (${DEMO_EMAIL}); aplicando só o complemento.`);
      await complementar(admin);
      return;
    }

    const { rows: categorias } = await admin.query('SELECT id, nome FROM "Categoria"');
    const categoriaId = Object.fromEntries(categorias.map((c) => [c.nome, c.id]));

    await admin.query('BEGIN');
    try {
      const senhaHash = await hashSenha(DEMO_SENHA);
      const { rows: [usuario] } = await admin.query(
        `INSERT INTO "Usuario" (nome, sobrenome, email, telefone, senha_hash)
         VALUES ('Sítio', 'Boa Vista', $1, '(35) 99999-1234', $2) RETURNING id`,
        [DEMO_EMAIL, senhaHash]
      );

      const { rows: [rural] } = await admin.query(
        `INSERT INTO "Endereco" (cliente_id, rua, numero, bairro, cep, cidade, uf, zona)
         VALUES ($1, 'Estrada Municipal do Pinhal', 'km 4', 'Zona Rural', '37550-000', 'Pouso Alegre', 'MG', 'RURAL')
         RETURNING id`,
        [usuario.id]
      );
      const { rows: [urbano] } = await admin.query(
        `INSERT INTO "Endereco" (cliente_id, rua, numero, bairro, cep, cidade, uf, zona)
         VALUES ($1, 'Rua das Hortas', '120', 'Centro', '37550-000', 'Pouso Alegre', 'MG', 'URBANA')
         RETURNING id`,
        [usuario.id]
      );

      let total = 0;
      for (const [categoria, produtos] of Object.entries(PRODUTOS)) {
        if (!categoriaId[categoria]) {
          console.warn(`Categoria "${categoria}" não encontrada — produtos ignorados.`);
          continue;
        }
        for (const p of produtos) {
          const { rows: [anuncio] } = await admin.query(
            `INSERT INTO "Anuncio" (anunciante_id, categoria_id, endereco_id, nome, descricao, preco)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [usuario.id, categoriaId[categoria], p.rural ? rural.id : urbano.id, p.nome, p.descricao, p.preco]
          );
          await admin.query(
            `INSERT INTO "Imagem" (anuncio_id, url, tipo, ordem) VALUES ($1, $2, 'PRINCIPAL', 1)`,
            [anuncio.id, p.imagem]
          );
          total++;
        }
      }

      await admin.query('COMMIT');
      console.log(`Seed concluído: ${total} anúncios criados para ${DEMO_EMAIL} (senha: ${DEMO_SENHA}).`);
      await complementar(admin);
    } catch (err) {
      await admin.query('ROLLBACK');
      throw err;
    }
  } finally {
    await admin.end();
  }
}

seed()
  .catch((err) => {
    console.error('Falha no seed:', err);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
