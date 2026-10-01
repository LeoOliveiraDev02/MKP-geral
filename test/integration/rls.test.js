/**
 * @file rls.test.js
 * @description Row-Level Security no PostgreSQL: garante que o BANCO (e não só
 * os services) isola os dados por usuário — DAOs chamados direto, sem as
 * checagens de propriedade da aplicação, não enxergam/alteram linhas alheias.
 */
process.env.JWT_SECRET = 'test-secret';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startServer, asSystem, api } = require('../helpers');

async function registrar(base, email) {
  const { body } = await api(base, 'POST', '/api/auth/register', {
    body: {
      nome: 'R', sobrenome: 'L', email, telefone: '11999998888', senha: 'Forte@123',
      rua: 'R', numero: '1', bairro: 'B', cidade: 'C', uf: 'SP', zona: 'URBANA',
    },
  });
  return body.data.usuario.id;
}

describe('RLS — isolamento no banco', () => {
  let server, idA, idB, enderecoB;
  let EnderecoDAO, UsuarioDAO, FavoritoDAO, TokenRevogadoDAO, runAsUser, getDb, schema;

  before(async () => {
    server = await startServer('rls');
    idA = await registrar(server.base, 'rls-a@test.com');
    idB = await registrar(server.base, 'rls-b@test.com');

    EnderecoDAO = require('../../src/dao/EnderecoDAO');
    UsuarioDAO = require('../../src/dao/UsuarioDAO');
    FavoritoDAO = require('../../src/dao/FavoritoDAO');
    TokenRevogadoDAO = require('../../src/dao/TokenRevogadoDAO');
    ({ runAsUser } = require('../../src/db/context'));
    ({ getDb } = require('../../src/db'));
    schema = require('../../src/db/schema');

    enderecoB = (await asSystem(() => EnderecoDAO.findByClienteId(idB)))[0];
  });

  after(async () => {
    await server.close();
  });

  it('a API conecta com role sem superuser/BYPASSRLS', async () => {
    const { rows } = await asSystem(() =>
      getDb().$client.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')
    );
    assert.deepEqual(rows[0], { rolsuper: false, rolbypassrls: false });
  });

  it('usuário não lê nem altera endereço de outro', async () => {
    assert.equal(await runAsUser(idA, () => EnderecoDAO.findById(enderecoB.id)), undefined);
    assert.deepEqual(await runAsUser(idA, () => EnderecoDAO.findByClienteId(idB)), []);

    await runAsUser(idA, () => EnderecoDAO.update(enderecoB.id, { ...enderecoB, rua: 'Invadida' }));
    await runAsUser(idA, () => EnderecoDAO.delete(enderecoB.id));
    const intacto = await asSystem(() => EnderecoDAO.findById(enderecoB.id));
    assert.equal(intacto.rua, 'R');
  });

  it('usuário não cria linhas em nome de outro (WITH CHECK)', async () => {
    await assert.rejects(
      runAsUser(idA, () => EnderecoDAO.create({
        clienteId: idB, rua: 'X', numero: '1', bairro: 'B', cidade: 'C', uf: 'SP', zona: 'URBANA',
      })),
      (err) => (err.cause || err).code === '42501' // violação de policy RLS
    );
  });

  it('usuário só vê/edita o próprio cadastro; anônimo não vê ninguém sem anúncio', async () => {
    assert.equal((await runAsUser(idA, () => UsuarioDAO.findById(idA))).id, idA);
    assert.equal(await runAsUser(idA, () => UsuarioDAO.findById(idB)), undefined);
    assert.equal(await UsuarioDAO.findByEmail('rls-a@test.com'), undefined);

    await runAsUser(idA, () => UsuarioDAO.updatePassword(idB, 'hash-invasor'));
    const b = await asSystem(() => UsuarioDAO.findByIdWithPassword(idB));
    assert.notEqual(b.senha_hash, 'hash-invasor');
  });

  it('favoritos de outro cliente são invisíveis', async () => {
    const [anuncio] = await asSystem(() =>
      getDb().insert(schema.anuncios).values({
        anuncianteId: idB, categoriaId: 1, enderecoId: enderecoB.id,
        nome: 'P', descricao: 'D', preco: 1,
      }).returning({ id: schema.anuncios.id })
    );
    await runAsUser(idB, () => FavoritoDAO.create({ clienteId: idB, anuncioId: anuncio.id }));

    assert.equal((await runAsUser(idB, () => FavoritoDAO.listByCliente(idB))).length, 1);
    assert.deepEqual(await runAsUser(idA, () => FavoritoDAO.listByCliente(idB)), []);
  });

  it('tabelas internas (denylist de JWT) só em contexto de sistema', async () => {
    const expiraEm = new Date(Date.now() + 3600 * 1000).toISOString();
    await asSystem(() => TokenRevogadoDAO.adicionar({ tokenHash: 'h-rls', expiraEm }));

    assert.equal(await asSystem(() => TokenRevogadoDAO.existePorHash('h-rls')), true);
    assert.equal(await runAsUser(idA, () => TokenRevogadoDAO.existePorHash('h-rls')), false);
    await assert.rejects(
      runAsUser(idA, () => TokenRevogadoDAO.adicionar({ tokenHash: 'h-user', expiraEm })),
      (err) => (err.cause || err).code === '42501' // violação de policy RLS
    );
  });
});
