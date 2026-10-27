/**
 * @file shareRoutes.js
 * @description Páginas de compartilhamento com prévia (Open Graph) para
 * WhatsApp/redes sociais (lógica em ShareController, HTML em views/).
 *
 *   GET /share/produto/:id  → prévia do anúncio
 *   GET /share/produtor/:id → prévia da página do produtor
 */

const express = require('express');
const ShareController = require('../controllers/ShareController');

const router = express.Router();

router.get('/produto/:id', ShareController.produto);
router.get('/produtor/:id', ShareController.produtor);

module.exports = router;
