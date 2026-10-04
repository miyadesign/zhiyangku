-- ============================================================================
-- 迁移：纸样图片合并为 images 数组
-- - 新增 patterns.images text[] 列
-- - 把现有 thumbnail_url 和 size_chart_url 合并到 images（thumbnail 第一张）
-- - 删除 size_chart_url 列
-- - 保留 thumbnail_url 列作为「第一张图片」（兼容旧读路径）—— 实际上前端只读 images
-- ============================================================================

BEGIN;

-- 1) 新增 images 列（默认空数组）
ALTER TABLE patterns ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}';

-- 2) 把现有 thumbnail_url + size_chart_url 合并写入 images
--    COALESCE 把 NULL 转成空数组，避免 NULL || array 类型不匹配
UPDATE patterns
SET images = ARRAY[thumbnail_url] || COALESCE(
    CASE
        WHEN size_chart_url IS NULL OR size_chart_url = '' THEN ARRAY[]::text[]
        ELSE ARRAY[size_chart_url]
    END,
    ARRAY[]::text[]
)
WHERE images = '{}' OR images IS NULL;

-- 3) 删除 size_chart_url 列
ALTER TABLE patterns DROP COLUMN IF EXISTS size_chart_url;

-- 4) thumbnail_url 保留（不强制 NOT NULL 也行，因为前端从 images 取）
--    但 schema 里改成了 notNull，所以保持现有 NOT NULL 即可

COMMIT;