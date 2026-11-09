import { Setting } from '../models/Setting.js';
import { Campaign } from '../models/Campaign.js';

// @desc    Get SEO settings & defaults
// @route   GET /api/seo/settings
// @access  Public
export const getSeoSettings = async (req, res, next) => {
  try {
    let setting = await Setting.findOne();
    if (!setting) {
      setting = await Setting.create({});
    }

    res.status(200).json({
      success: true,
      seo: setting.seo,
      siteName: setting.siteName,
      siteTagline: setting.siteTagline,
      siteDescription: setting.siteDescription,
      socialLinks: setting.socialLinks,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update SEO settings (Admin)
// @route   PUT /api/seo/settings
// @access  Private (Admin)
export const updateSeoSettings = async (req, res, next) => {
  try {
    let setting = await Setting.findOne();
    if (!setting) {
      setting = new Setting();
    }

    if (req.body.siteName) setting.siteName = req.body.siteName;
    if (req.body.siteTagline) setting.siteTagline = req.body.siteTagline;
    if (req.body.siteDescription) setting.siteDescription = req.body.siteDescription;
    if (req.body.socialLinks) setting.socialLinks = { ...setting.socialLinks, ...req.body.socialLinks };

    if (req.body.seo) {
      setting.seo = {
        ...setting.seo,
        ...req.body.seo,
      };
    }

    await setting.save();

    res.status(200).json({
      success: true,
      message: 'SEO settings updated successfully',
      setting,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Dynamic XML sitemap generator
// @route   GET /api/seo/sitemap.xml
// @access  Public
export const getSitemapXml = async (req, res, next) => {
  try {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const campaigns = await Campaign.find({ status: { $ne: 'paused' } })
      .select('slug updatedAt images title')
      .lean();

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/causes</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;

    campaigns.forEach((campaign) => {
      const lastMod = new Date(campaign.updatedAt).toISOString().split('T')[0];
      const primaryImage = campaign.images?.[0]?.url;

      xml += `
  <url>
    <loc>${baseUrl}/causes/${campaign.slug}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>${
      primaryImage
        ? `
    <image:image>
      <image:loc>${primaryImage.replace(/&/g, '&amp;')}</image:loc>
      <image:title>${(campaign.title || '').replace(/&/g, '&amp;')}</image:title>
    </image:image>`
        : ''
    }
  </url>`;
    });

    xml += `\n</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.status(200).send(xml);
  } catch (error) {
    next(error);
  }
};

// @desc    SEO health audit for all campaigns
// @route   GET /api/seo/audit
// @access  Private (Admin)
export const getSeoAudit = async (req, res, next) => {
  try {
    const campaigns = await Campaign.find().select('title slug summary images seo status').lean();

    const auditList = campaigns.map((c) => {
      let score = 100;
      const issues = [];

      // Check title length (ideal 40 - 65 chars)
      const titleLen = c.seo?.metaTitle?.length || c.title?.length || 0;
      if (titleLen < 30) {
        score -= 15;
        issues.push('Title is short (recommended 40-65 chars for Google search snippet).');
      } else if (titleLen > 70) {
        score -= 10;
        issues.push('Title may be truncated on mobile SERPs (exceeds 70 chars).');
      }

      // Check description (ideal 120 - 160 chars)
      const descLen = c.seo?.metaDescription?.length || c.summary?.length || 0;
      if (descLen < 80) {
        score -= 20;
        issues.push('Meta description is too short; aim for 120-160 characters.');
      } else if (descLen > 165) {
        score -= 10;
        issues.push('Meta description exceeds 165 chars and might get truncated.');
      }

      // Check images
      if (!c.images || c.images.length === 0) {
        score -= 30;
        issues.push('Missing photo; campaigns need compelling visual proof to rank and convert.');
      } else if (!c.seo?.ogImage && !c.images[0]?.url) {
        score -= 15;
        issues.push('No OpenGraph image specified for social preview cards.');
      }

      return {
        id: c._id,
        title: c.title,
        slug: c.slug,
        status: c.status,
        score: Math.max(0, score),
        issues,
        ogImage: c.seo?.ogImage || c.images?.[0]?.url || '',
        metaTitle: c.seo?.metaTitle || c.title,
        metaDescription: c.seo?.metaDescription || c.summary,
      };
    });

    const avgScore =
      auditList.length > 0
        ? Math.round(auditList.reduce((acc, curr) => acc + curr.score, 0) / auditList.length)
        : 100;

    res.status(200).json({
      success: true,
      avgScore,
      totalAudited: auditList.length,
      auditList,
    });
  } catch (error) {
    next(error);
  }
};
