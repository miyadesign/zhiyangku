-- 纸样库数据导出（patterns + tags）
-- 在你个人 Neon 账号的 SQL 编辑器中直接执行本文件即可完成导入
-- 注意：图片/文件字段为 Vercel Blob 的 pathname，需配合原项目的 Blob 存储才能访问

BEGIN;

CREATE TABLE IF NOT EXISTS tags (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL UNIQUE,
  "color" text NOT NULL DEFAULT 'amber',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (1, '女装', 'rose', 1, '2026-08-03T07:16:18.046882') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (2, '男装', 'sky', 2, '2026-08-03T07:16:18.046882') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (3, '女童', 'fuchsia', 3, '2026-08-03T07:16:18.046882') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (4, '男童', 'emerald', 4, '2026-08-03T07:16:18.046882') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (5, '半身裙', 'pink', 5, '2026-08-03T07:16:18.046882') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (6, '外套', 'orange', 6, '2026-08-03T07:16:18.046882') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (7, '裤子', 'teal', 7, '2026-08-03T07:16:18.046882') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (8, '秋衣裤', 'blue', 8, '2026-08-03T07:16:18.046882') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (9, '内裤', 'pink', 9, '2026-08-03T07:16:18.046882') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (10, '打底衫', 'cyan', 10, '2026-08-03T07:16:18.046882') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (11, '连衣裙', 'fuchsia', 11, '2026-08-03T07:16:18.046882') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (12, '其他', 'slate', 12, '2026-08-03T07:16:18.046882') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (13, '童装', 'cyan', 13, '2026-08-03T07:52:22.866338') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (14, '卫衣', 'blue', 14, '2026-08-03T08:29:12.51167') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (15, '衬衫', 'emerald', 15, '2026-08-03T08:43:08.618381') ON CONFLICT (id) DO NOTHING;
INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (16, '家居服', 'indigo', 16, '2026-09-04T02:24:18.176887') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS patterns (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "studio" text NOT NULL,
  "categories" text[] NOT NULL DEFAULT '{}',
  "thumbnail_url" text NOT NULL,
  "size_chart_url" text,
  "file_url" text,
  "file_name" text,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (1, '法式泡泡袖衬衫', '卫兰纸样', ARRAY['女装']::text[], 'patterns/shirt-qQDrHdgwTxdqMFdC5wBTgFMrWkrYgM.png', 'patterns/size-chart-top-GTjfAkSbymX78JpEhzZV4JBvbxJ1Y3.png', NULL, NULL, NULL, '2026-08-03T06:53:42.715224', '2026-08-03T06:53:42.715224') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (2, '工装风双层裤子', '大陈', ARRAY['男装']::text[], 'patterns/ScreenShot_2026-08-03_150552_583-3MnYGU5DUGfywEXYRCftjXwvx4xeSS.png', 'patterns/ScreenShot_2026-08-03_150738_700-9gr5vFo6zMC8ExoWRkg0Sju52pWIZi.png', 'patterns/files/PLT-exeyUV8iFk7ln9FQafjd3EZjnrHBEH.zip', 'PLT.zip', NULL, '2026-08-03T07:07:49.580612', '2026-08-03T07:35:34.959') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (3, '测试带文件纸样', '小琴纸样', ARRAY['连衣裙']::text[], 'patterns/images/blouse-ht0PlIQRLi04BJqztn59rDcdY4NcSx.png', NULL, 'patterns/files/女童连衣裙纸样-yA6T0EEKSeXHe50DDuy3nVsWV44giX.pdf', '女童连衣裙纸样.pdf', NULL, '2026-08-03T07:27:22.318956', '2026-08-03T07:27:22.318956') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (4, '无袖休闲背心', '大陈', ARRAY['童装']::text[], 'patterns/images/ScreenShot_2026-08-03_154921_143-VmOO3RwCDUHkl9gZbAzY3ROyTPvVFU.png', 'patterns/images/dachen无袖休闲背心尺码表-sJ0NQPObU9i8TFe5Ea1hArrSsfl910.jpg', 'patterns/files/plt-mb54Jfihjn6z8y3V9JGuHTMh4ICvwr.zip', 'plt.zip', NULL, '2026-08-03T07:52:09.563679', '2026-08-03T07:52:30.778') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (5, '童趣短袖短裤衬衫', '大陈', ARRAY['童装']::text[], 'patterns/images/大陈衬衫-Ru1MXH1YIUYZzgMUQ4pNzevJkrrOv0.jpg', 'patterns/images/ScreenShot_2026-08-03_155515_304-hdmyc13g0paAATu4gqOPt32k68ARWH.png', 'patterns/files/plt-unE1FhdAG2JIxpykw6XsX1mG15A964.zip', 'plt.zip', NULL, '2026-08-03T07:58:33.872936', '2026-08-03T07:58:33.872936') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (6, '小飞袖连衣裙', '大陈', ARRAY['女童']::text[], 'patterns/images/ScreenShot_2026-08-03_160043_236-LnS2ZFiCk7jC6LbwFCfBHRxzGsel6Z.png', 'patterns/images/ScreenShot_2026-08-03_160105_630-XMQT9X3P87r8ACXVyjRIeMFavjygEn.png', 'patterns/files/plt-wqjNYdgzJH5KxcPZznE1W4qCWaEX4h.zip', 'plt.zip', NULL, '2026-08-03T08:03:13.009203', '2026-08-03T08:03:13.009203') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (7, '儿童娃娃衫+花苞裤', '大陈', ARRAY['女童']::text[], 'patterns/images/儿童娃娃衫+花苞裤-n6nnP2pxaEijOjgWmRhvUHgK1LKjqW.jpg', 'patterns/images/ScreenShot_2026-08-03_160505_653-dGFBL4Az6NFWOlkvfEIOmhjH4JeKpC.png', 'patterns/files/plt-vZI6W7kLs5cQezuH08zFjyPjnE4O1I.zip', 'plt.zip', NULL, '2026-08-03T08:11:43.520523', '2026-08-03T08:11:43.520523') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (8, '学院风裙裤', '大陈', ARRAY['女童']::text[], 'patterns/images/款式图2-UITxoeZKOYSsVDk3bcog1QSTNECT2S.jpg', 'patterns/images/ScreenShot_2026-08-03_161438_421-PQb5sO0cSGW5ycpZAhQbyiWHqYC0ih.png', 'patterns/files/plt-lNJBYqxpC7K77k0WVol0rWT78LqeJn.zip', 'plt.zip', NULL, '2026-08-03T08:16:11.272674', '2026-08-03T08:16:11.272674') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (9, '学院风套装短裤', '大陈', ARRAY['童装']::text[], 'patterns/images/款式图1-EgvFnhFpK5YL0k1QX4Z3CIlAkNRF4t.jpg', 'patterns/images/ScreenShot_2026-08-03_161726_420-UamQSFWRDPExIy5OSY5Bg1rCixV0Zq.png', 'patterns/files/plt-fLHAWmB4lLupPvSYpeVFB6nMoO4gqc.zip', 'plt.zip', NULL, '2026-08-03T08:18:34.246178', '2026-08-03T08:18:34.246178') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (10, '宽松落肩短袖T', '大陈', ARRAY['童装']::text[], 'patterns/images/款式图1(1)-3ClQN5r1fqvcZzIUAD0h98k2ahdBjg.jpg', 'patterns/images/ScreenShot_2026-08-03_162039_707-MoAJsgJrJObblQRjqIkWXCSpy5nb8R.png', 'patterns/files/plt-30LXOiFAJBjB5ma1cWtkIKgvtnHgBR.zip', 'plt.zip', NULL, '2026-08-03T08:21:38.407082', '2026-08-03T08:21:38.407082') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (11, '打底衫', '大陈', ARRAY['童装']::text[], 'patterns/images/尺码表-DQWuZCVmLsqhVPOSg47JPlr9Bel7Ez.jpg', NULL, 'patterns/files/打底衫plt-j181frUhceXo6tpwjguBQcui1AXw0N.zip', '打底衫plt.zip', NULL, '2026-08-03T08:26:16.938929', '2026-08-03T08:26:16.938929') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (12, '翻领卫衣', '大陈', ARRAY['童装']::text[], 'patterns/images/款式图3-2U5yAkIFVKlFtjbKpXDe7HIwZlw8u4.jpg', 'patterns/images/翻领卫衣尺码表-pJUPYZzPRERI9NPo5XdlVoPDVlrlCz.jpg', 'patterns/files/翻领卫衣plt-dOgQChJHVX0UNMTtzT1Bsdp7bhA6pT.zip', '翻领卫衣plt.zip', NULL, '2026-08-03T08:28:38.09797', '2026-08-03T08:28:38.09797') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (13, '翻领羽绒服', '大陈', ARRAY['外套']::text[], 'patterns/images/款式图4-9NPRDQQiauN9e80WQosSptbzNWfQv0.jpg', 'patterns/images/尺码表-p80fj3YixubATPqJzE9LtLIqPXp7vC.jpg', 'patterns/files/翻领羽绒服plt-y4TLEENXEPUGeC9YQT1Ppbl6IwH6TY.zip', '翻领羽绒服plt.zip', NULL, '2026-08-03T08:31:55.963187', '2026-08-03T08:31:55.963187') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (14, '韩版休闲外套', '大陈', ARRAY['外套', '衬衫']::text[], 'patterns/images/款式图4-4OitSXVSkUA7LUlGURZsJzsLnsfr9u.jpg', 'patterns/images/ScreenShot_2026-08-03_163539_150-nStf90RatGzKhGU5cFvP4bJXRdAr9N.png', 'patterns/files/plt-5tpwaxamUvZn8u9HThf6VSH2WZ3EwC.zip', 'plt.zip', NULL, '2026-08-03T08:36:24.594142', '2026-08-03T08:43:14.634') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (15, '韩版休闲阔腿裤', '大陈', ARRAY['童装']::text[], 'patterns/images/ScreenShot_2026-08-03_163419_813-8PETtpUIp4P5WHuQYCtlO3Mh9W7yZN.png', 'patterns/images/ScreenShot_2026-08-03_163722_924-ThHIfKA77Uv75AIQRSe1wzoBarv1sY.png', 'patterns/files/plt-RGVPAaFR2yaTY2WYFBzoA2b3CIYnL6.zip', 'plt.zip', NULL, '2026-08-03T08:37:53.502', '2026-08-03T08:37:53.502') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (16, '护脖轻薄羽绒服', '大陈', ARRAY['外套']::text[], 'patterns/images/款式图1-rauq3qtHuRUXyy3I1f29USKv014348.jpg', 'patterns/images/尺码表-TsID6tE2vPwv8DmNnD4y6BWxDhAlsN.jpg', 'patterns/files/护脖轻薄羽绒服plt-PJWA7d6NxfLsohmZ0RbhYupCxK162h.zip', '护脖轻薄羽绒服plt.zip', NULL, '2026-08-03T08:42:36.537202', '2026-08-03T08:42:36.537202') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (17, '两种衬衫（直角领+娃娃领衬衫）', '大陈', ARRAY['童装', '衬衫']::text[], 'patterns/images/ScreenShot_2026-08-03_164841_962-L0QcxC0BkGPkXoUN6988d96AGWymtL.png', 'patterns/images/两种衬衫尺码表-yOijQllZSMMbU8Tz05pdERA1vAuMhc.jpg', 'patterns/files/plt-XOmlq9QeKvshlp6sNs7pOLJwLQLKnw.zip', 'plt.zip', NULL, '2026-08-03T08:49:42.968912', '2026-08-03T08:49:42.968912') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (18, '落肩棉服', '大陈', ARRAY['外套']::text[], 'patterns/images/款式图5-lKZ5NVeUHr0GPXvbcck4COTaYrN5iN.jpg', 'patterns/images/款式图尺码表-af3kkmSSozGqdduviQELeBvIWcjOTO.jpg', 'patterns/files/落肩棉服plt-EwGNHkAIaK8FV4YXlWb1ePBqx1eGer.zip', '落肩棉服plt.zip', NULL, '2026-08-03T08:52:46.400288', '2026-08-03T08:52:46.400288') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (19, '酷酷工装裤2.0', '大陈', ARRAY['裤子', '童装']::text[], 'patterns/images/酷酷工装裤2.0尺码表-jYhZMXvgMeOz2gkkA3WEXefvKsg9Tr.jpg', NULL, NULL, NULL, NULL, '2026-08-03T09:51:39.689726', '2026-08-03T09:51:39.689726') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (20, '四款儿童插肩｜正肩｜长袖｜短袖T', '创美时光', ARRAY['童装']::text[], 'patterns/images/ScreenShot_2026-08-03_220014_065-kAOWCfNZ2CIRhrZaYeUP2PTQ4U32Ms.png', NULL, NULL, NULL, NULL, '2026-08-03T14:02:05.064129', '2026-08-03T14:02:05.064129') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (21, '男女童家居服套装', '创美时光', ARRAY['童装']::text[], 'patterns/images/A2698男女童家居服套装尺码表-VQe6bpn1lK8I57a0KLVcHzQdBHuUQT.jpg', NULL, NULL, NULL, NULL, '2026-08-03T14:04:35.40615', '2026-08-03T14:04:35.40615') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (22, 'A2699时光韩系拼色插肩袖卫衣', '创美时光', ARRAY['童装']::text[], 'patterns/images/A2699时光韩系拼色插肩袖卫衣尺码表-EaaUj1eHHlxizptd4S6JXA9fnk2cgN.jpg', NULL, NULL, NULL, NULL, '2026-08-04T00:51:47.917531', '2026-09-04T02:30:37.717') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (23, '批量A衬衫', '卫兰纸样', ARRAY['上衣', '女']::text[], 'patterns/images/blouse-iickFhm1oIDj77RDbNphMWt6apgjpy.png', NULL, NULL, NULL, '批量测试A', '2026-09-04T02:15:29.722805', '2026-09-04T02:15:29.722805') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (24, '批量B外套', '卫兰纸样', ARRAY['外套', '男']::text[], 'patterns/images/coat-f3rrDfi4xvIG1sysXQk2OpgjKjIEWv.png', NULL, NULL, NULL, '批量测试B', '2026-09-04T02:15:29.722805', '2026-09-04T02:15:29.722805') ON CONFLICT (id) DO NOTHING;
INSERT INTO patterns (id, name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note, created_at, updated_at) VALUES (25, '232L鹅宝宝童装简约休闲四件套', '飞家纸样', ARRAY['家居服', '女']::text[], 'patterns/images/01-5iFmZ4oB0kRsobOoOaoBhVp3MKt7mc.png', 'patterns/images/01-1-Ym5rtnUAWmwz0hYOTd81RtMUGvO3Oy.png', NULL, NULL, NULL, '2026-09-04T02:27:17.747638', '2026-09-04T02:30:23.11') ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('tags', 'id'), (SELECT COALESCE(MAX(id), 1) FROM tags));
SELECT setval(pg_get_serial_sequence('patterns', 'id'), (SELECT COALESCE(MAX(id), 1) FROM patterns));

COMMIT;
