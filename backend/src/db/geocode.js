/**
 * @file geocode.js (src/db)
 * @description Preenche latitude/longitude dos endereços que ainda não têm
 * coordenadas (endereços criados antes do "perto de mim" ou com o geocoder
 * desligado). Usa o Nominatim respeitando 1 requisição por segundo.
 *
 * Uso: `npm run db:geocode` (exige GEOCODER=nominatim no .env)
 */

require('dotenv').config();
const { initializeDatabase, closeDatabase } = require('./index');
const GeocodificacaoService = require('../services/GeocodificacaoService');

(async () => {
  if ((process.env.GEOCODER || '').toLowerCase() !== 'nominatim') {
    console.error('Defina GEOCODER=nominatim no .env para geocodificar endereços.');
    process.exit(1);
  }
  await initializeDatabase();
  try {
    const resultado = await GeocodificacaoService.geocodificarTodosPendentes();
    console.log(`Endereços sem coordenadas: ${resultado.pendentes} · geocodificados agora: ${resultado.geocodificados}`);
  } finally {
    await closeDatabase();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
