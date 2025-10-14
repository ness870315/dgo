/**
 * Simple KOL API Routes
 * 
 * Endpoints:
 * GET /api/kol/kols - Get all KOLs
 * POST /api/kol/kols - Add a new KOL
 * DELETE /api/kol/kols/:handle - Delete a KOL
 * GET /api/kol/posts - Get all posts
 */

import express from 'express';
import KOLService from '../services/KOLService.js';

const router = express.Router();
let kolService = null;

// Initialize service
const initializeService = async () => {
  if (!kolService) {
    kolService = new KOLService();
    await kolService.initialize();
  }
  return kolService;
};

// GET /api/kol/kols - Get all KOLs
router.get('/kols', async (req, res) => {
  try {
    const service = await initializeService();
    const kols = service.getKOLs();
    
    res.json({
      success: true,
      data: kols
    });
  } catch (error) {
    console.error('❌ [KOL API] Get KOLs error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/kol/kols - Add a new KOL
router.post('/kols', async (req, res) => {
  try {
    const service = await initializeService();
    const { handle } = req.body;
    
    if (!handle) {
      return res.status(400).json({
        success: false,
        error: 'Handle is required'
      });
    }
    
    const newKOL = await service.addKOL(handle);
    
    res.json({
      success: true,
      data: newKOL,
      message: `KOL @${newKOL.handle} added successfully`
    });
    
  } catch (error) {
    console.error('❌ [KOL API] Add KOL error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/kol/kols/:handle - Delete a KOL
router.delete('/kols/:handle', async (req, res) => {
  try {
    const service = await initializeService();
    const { handle } = req.params;
    
    await service.deleteKOL(handle);
    
    res.json({
      success: true,
      message: `KOL @${handle} deleted successfully`
    });
    
  } catch (error) {
    console.error('❌ [KOL API] Delete KOL error:', error.message);
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/kol/posts - Get all posts
router.get('/posts', async (req, res) => {
  try {
    const service = await initializeService();
    const posts = service.getPosts();
    
    res.json({
      success: true,
      data: posts
    });
  } catch (error) {
    console.error('❌ [KOL API] Get posts error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
