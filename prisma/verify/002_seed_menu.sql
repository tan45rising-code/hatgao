-- ------------------------------------------------------------- SETTINGS ---
INSERT INTO settings (id) VALUES ('singleton')
ON CONFLICT DO NOTHING;

-- Opening hours: Monday–Sunday, 12:00–22:30.
-- Stored as minutes since midnight: 12:00 = 720, 22:30 = 1350.
INSERT INTO opening_hours (id, "dayOfWeek", "opensAt", "closesAt", "isClosed") VALUES
  ('oh-0', 0, 720, 1350, FALSE),
  ('oh-1', 1, 720, 1350, FALSE),
  ('oh-2', 2, 720, 1350, FALSE),
  ('oh-3', 3, 720, 1350, FALSE),
  ('oh-4', 4, 720, 1350, FALSE),
  ('oh-5', 5, 720, 1350, FALSE),
  ('oh-6', 6, 720, 1350, FALSE)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------- CATEGORIES ---
INSERT INTO categories (id, name, slug, "sortOrder") VALUES
  ('cat-starters',    'Starters',    'starters',     10),
  ('cat-noodles',     'Noodles',     'noodles',      20),
  ('cat-noodle-soup', 'Noodle Soup', 'noodle-soup',  30),
  ('cat-beef',        'Beef',        'beef',         40),
  ('cat-chicken',     'Chicken',     'chicken',      50),
  ('cat-prawns',      'Prawns',      'prawns',       60),
  ('cat-tofu',        'Tofu',        'tofu',         70),
  ('cat-rice',        'Rice',        'rice',         80),
  ('cat-duck',        'Duck',        'duck',         90),
  ('cat-soft-drinks', 'Soft Drinks', 'soft-drinks', 100),
  ('cat-juices',      'Juices',      'juices',      110),
  ('cat-beers',       'Beers',       'beers',       120)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------ MODIFIER GROUPS ---
-- The printed menu shows these as bullet points under a dish, but they are
-- choices, not ingredients — "Summer Rolls: chicken / shrimp / duck" means
-- pick one. Modelled as required single-select groups.
INSERT INTO modifier_groups (id, name, description, "minSelect", "maxSelect", "isRequired", "sortOrder") VALUES
  ('mg-summer-roll', 'Choose your filling', NULL, 1, 1, TRUE, 10),
  ('mg-spring-roll', 'Choose your filling', NULL, 1, 1, TRUE, 10),
  ('mg-dumpling',    'Choose your filling', NULL, 1, 1, TRUE, 10),
  ('mg-bun',         'Choose your filling', NULL, 1, 1, TRUE, 10),
  ('mg-gua-bao',     'Choose your filling', NULL, 1, 1, TRUE, 10),
  ('mg-salad-protein','Choose your protein',NULL, 1, 1, TRUE, 10),
  ('mg-rice-type',   'Choose your rice',    NULL, 1, 1, TRUE, 10),
  ('mg-beer-size',   'Choose your size',    NULL, 1, 1, TRUE, 10)
ON CONFLICT DO NOTHING;

-- All price deltas are 0 for now — Tan is deciding whether any choice
-- carries a surcharge. The model supports it; these are simply unset.
INSERT INTO modifiers (id, "groupId", name, "priceDeltaCents", "isDefault", "sortOrder") VALUES
  ('mod-sr-chicken',  'mg-summer-roll', 'Chicken',    0, TRUE,  10),
  ('mod-sr-shrimp',   'mg-summer-roll', 'Shrimp',     0, FALSE, 20),
  ('mod-sr-duck',     'mg-summer-roll', 'Duck',       0, FALSE, 30),

  ('mod-spr-pork',    'mg-spring-roll', 'Pork',       0, TRUE,  10),
  ('mod-spr-chicken', 'mg-spring-roll', 'Chicken',    0, FALSE, 20),
  ('mod-spr-veg',     'mg-spring-roll', 'Vegetable',  0, FALSE, 30),
  ('mod-spr-beef',    'mg-spring-roll', 'Beef',       0, FALSE, 40),

  ('mod-dmp-duck',    'mg-dumpling',    'Duck',       0, FALSE, 10),
  ('mod-dmp-chicken', 'mg-dumpling',    'Chicken',    0, TRUE,  20),
  ('mod-dmp-veg',     'mg-dumpling',    'Vegetable',  0, FALSE, 30),

  ('mod-bun-pork',    'mg-bun',         'Pork',       0, TRUE,  10),
  ('mod-bun-chicken', 'mg-bun',         'Chicken',    0, FALSE, 20),
  ('mod-bun-veg',     'mg-bun',         'Vegetable',  0, FALSE, 30),

  ('mod-gb-prawns',   'mg-gua-bao',     'Prawns',     0, TRUE,  10),
  ('mod-gb-chicken',  'mg-gua-bao',     'Chicken',    0, FALSE, 20),

  ('mod-sp-shrimp',   'mg-salad-protein','Shrimp',    0, TRUE,  10),
  ('mod-sp-chicken',  'mg-salad-protein','Chicken',   0, FALSE, 20),

  ('mod-rice-fried',  'mg-rice-type',   'Fried rice',   0, TRUE,  10),
  ('mod-rice-steamed','mg-rice-type',   'Steamed rice', 0, FALSE, 20),

  -- Beer sizes DO carry a price difference: €2 / €3 / €3.50 for
  -- 330 / 500 / 630 ml. Base price is €2, deltas add the rest.
  ('mod-beer-330',    'mg-beer-size',   '330ml',        0, TRUE,  10),
  ('mod-beer-500',    'mg-beer-size',   '500ml',      100, FALSE, 20),
  ('mod-beer-630',    'mg-beer-size',   '630ml',      150, FALSE, 30)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------- PRODUCTS ---
-- STARTERS
INSERT INTO products (id, "categoryId", "menuNumber", name, slug, description, "priceCents", "vatRateBps", "sortOrder") VALUES
  ('p-001','cat-starters', 1,'Summer Rolls (2 pcs)','summer-rolls',NULL,500,500,10),
  ('p-002','cat-starters', 2,'Spring Rolls (2 pcs)','spring-rolls',NULL,500,500,20),
  ('p-003','cat-starters', 3,'Seafood Rolls (2 pcs)','seafood-rolls','Prawn, squid, carrot, taro',500,500,30),
  ('p-004','cat-starters', 4,'Grilled Pork Sausage (2 pcs)','grilled-pork-sausage','Minced pork, garlic, onion',500,500,40),
  ('p-005','cat-starters', 5,'Dumplings (8 pcs)','dumplings',NULL,600,500,50),
  ('p-006','cat-starters', 6,'Fried Dumplings (8 pcs)','fried-dumplings',NULL,600,500,60),
  ('p-007','cat-starters', 7,'Steamed Bun (2 pcs)','steamed-bun',NULL,600,500,70),
  ('p-008','cat-starters', 8,'Gua Bao (2 pcs)','gua-bao',NULL,600,500,80),
  ('p-009','cat-starters', 9,'Mixed Beef Salad','mixed-beef-salad','Beef, carrot, cucumber, onion, bell pepper',800,500,90),
  ('p-010','cat-starters',10,'Mixed Chicken Salad','mixed-chicken-salad','Chicken, bell pepper, cucumber, carrot, peanut',700,500,100),
  ('p-011','cat-starters',11,'Mango Salad','mango-salad','Mango, lettuce, cucumber, carrot, herbs',800,500,110),
  ('p-012','cat-starters',12,'Mixed Shrimp Salad','mixed-shrimp-salad','Vermicelli, coriander, spring onion',800,500,120)
ON CONFLICT DO NOTHING;

-- NOODLES
INSERT INTO products (id, "categoryId", "menuNumber", name, slug, description, "priceCents", "vatRateBps", "sortOrder") VALUES
  ('p-013','cat-noodles',13,'Beef Fried Noodles','beef-fried-noodles','Noodles, beef, mixed vegetable, fried onion',1000,500,10),
  ('p-014','cat-noodles',14,'Seafood Fried Noodles','seafood-fried-noodles','Noodles, prawn, squid, mixed vegetable',1000,500,20),
  ('p-015','cat-noodles',15,'Chicken Fried Noodles','chicken-fried-noodles','Noodles, chicken, mixed vegetable',900,500,30),
  ('p-016','cat-noodles',16,'Vegetarian Fried Noodles','vegetarian-fried-noodles','Noodles, mixed vegetable',750,500,40),
  ('p-017','cat-noodles',17,'Vermicelli Pork Bowl','vermicelli-pork-bowl','Vermicelli noodles, grilled pork, cucumber, herbs, sweet fish sauce',900,500,50),
  ('p-018','cat-noodles',18,'Vermicelli Pork Bowl with Spring Rolls','vermicelli-pork-bowl-spring-rolls','Vermicelli noodles, grilled pork, spring roll, cucumber, herbs, sweet fish sauce',900,500,60),
  ('p-019','cat-noodles',19,'Vermicelli Beef Bowl','vermicelli-beef-bowl','Vermicelli noodles, beef, garlic, vegetable, herbs',900,500,70),
  ('p-020','cat-noodles',20,'Vermicelli Spring Roll Bowl','vermicelli-spring-roll-bowl','Vermicelli noodles, spring roll, vegetable',800,500,80),
  ('p-021','cat-noodles',21,'Vermicelli Tofu & Spring Roll Bowl','vermicelli-tofu-spring-roll-bowl','Vermicelli noodles, fried tofu, spring roll, grilled pork sausage, sweet fish sauce',900,500,90),
  ('p-022','cat-noodles',22,'Chicken Pad Thai','chicken-pad-thai','Chicken, rice noodles, onion, bean sprouts, carrot, chillies, peanuts',900,500,100),
  ('p-023','cat-noodles',23,'Shrimp Pad Thai','shrimp-pad-thai','Shrimps, rice noodles, onion, bean sprouts, carrot, chillies, peanuts',900,500,110),
  ('p-024','cat-noodles',24,'Tofu Pad Thai','tofu-pad-thai','Tofu, rice noodles, onion, bean sprouts, carrot, chillies, peanuts',800,500,120)
ON CONFLICT DO NOTHING;

-- NOODLE SOUP
INSERT INTO products (id, "categoryId", "menuNumber", name, slug, description, "priceCents", "vatRateBps", "sortOrder") VALUES
  ('p-025','cat-noodle-soup',25,'Beef Pho','beef-pho','Rice noodle, beef, broth, spring onion, herbs',850,500,10),
  ('p-026','cat-noodle-soup',26,'Garlic Beef Pho','garlic-beef-pho','Rice noodle, garlic stir-fried beef, broth, spring onion, herbs',900,500,20),
  ('p-027','cat-noodle-soup',27,'Rare Beef Pho','rare-beef-pho','Rice noodle, thinly sliced rare beef, broth, spring onion, herbs',900,500,30),
  ('p-028','cat-noodle-soup',28,'Tofu Pho','tofu-pho','Rice noodle, fried tofu, broth, spring onion, herbs',800,500,40),
  ('p-029','cat-noodle-soup',29,'Chicken Pho','chicken-pho','Chicken, rice noodle, broth, herbs',850,500,50),
  ('p-030','cat-noodle-soup',30,'Meat Ball Pho','meat-ball-pho','Rice noodle, pork meat balls, broth, spring onion, herbs',850,500,60)
ON CONFLICT DO NOTHING;

-- BEEF
INSERT INTO products (id, "categoryId", "menuNumber", name, slug, description, "priceCents", "vatRateBps", "sortOrder") VALUES
  ('p-031','cat-beef',31,'Black Pepper Beef','black-pepper-beef','Beef, garlic, onion, carrot, bell pepper, black pepper sauce',1000,500,10),
  ('p-032','cat-beef',32,'Bulgogi Beef','bulgogi-beef','Beef, garlic, onion, carrot, bell pepper, bulgogi sauce. Served with rice',1000,500,20),
  ('p-033','cat-beef',33,'Kung Pao Beef','kung-pao-beef','Beef, garlic, onion, carrot, bell pepper, kung pao sauce',1000,500,30)
ON CONFLICT DO NOTHING;

-- CHICKEN
INSERT INTO products (id, "categoryId", "menuNumber", name, slug, description, "priceCents", "vatRateBps", "sortOrder") VALUES
  ('p-034','cat-chicken',34,'Sweet and Sour Chicken','sweet-and-sour-chicken','Chicken, bell pepper, carrot, sweet and sour sauce',900,500,10),
  ('p-035','cat-chicken',35,'Kung Pao Chicken','kung-pao-chicken','Chicken, bell pepper, carrot, kung pao sauce',900,500,20),
  ('p-036','cat-chicken',36,'Cashew Chicken','cashew-chicken','Chicken, bell pepper, carrot, cashew nuts',900,500,30),
  ('p-037','cat-chicken',37,'Bulgogi Chicken','bulgogi-chicken','Chicken, garlic, onion, carrot, bell pepper, bulgogi sauce',900,500,40),
  ('p-038','cat-chicken',38,'Korean Chicken','korean-chicken','Chicken, bell pepper, carrot, Korean chicken sauce',900,500,50),
  ('p-039','cat-chicken',39,'Black Pepper Chicken','black-pepper-chicken','Chicken, garlic, onion, carrot, bell pepper, black pepper sauce',900,500,60),
  ('p-040','cat-chicken',40,'Chicken Skewer','chicken-skewer','Grilled chicken with satay sauce',700,500,70),
  ('p-041','cat-chicken',41,'Chicken Nuggets (6 pcs)','chicken-nuggets',NULL,500,500,80),
  ('p-042','cat-chicken',42,'Chicken Wings (6 pcs)','chicken-wings',NULL,500,500,90)
ON CONFLICT DO NOTHING;

-- PRAWNS
INSERT INTO products (id, "categoryId", "menuNumber", name, slug, description, "priceCents", "vatRateBps", "sortOrder") VALUES
  ('p-043','cat-prawns',43,'Sweet and Sour Prawns','sweet-and-sour-prawns','Prawns, bell pepper, carrot, sweet and sour sauce',950,500,10),
  ('p-044','cat-prawns',44,'Kung Pao Prawns','kung-pao-prawns','Prawns, bell pepper, carrot, kung pao sauce',950,500,20),
  ('p-045','cat-prawns',45,'Crispy Prawn Steak (8 pcs)','crispy-prawn-steak','Prawns, onion, spring onion, carrot',950,500,30),
  ('p-046','cat-prawns',46,'Sesame Coated Prawns (8 pcs)','sesame-coated-prawns','Prawns, salad, sesame seeds',950,500,40),
  ('p-047','cat-prawns',47,'Prawn Tempura (8 pcs)','prawn-tempura','Prawns, tempura batter',950,500,50),
  ('p-048','cat-prawns',48,'Cashew Prawns','cashew-prawns','Prawns, bell pepper, carrot, cashew nuts',950,500,60),
  ('p-049','cat-prawns',49,'Rocket Prawns (8 pcs)','rocket-prawns','Prawns, spring roll wrap',850,500,70)
ON CONFLICT DO NOTHING;

-- TOFU
-- NOTE: Spicy Tofu contains minced pork. It sits in the Tofu section but is
-- NOT vegetarian — flagged to Tan, since customers will reasonably assume
-- otherwise from the category name.
INSERT INTO products (id, "categoryId", "menuNumber", name, slug, description, "priceCents", "vatRateBps", "sortOrder") VALUES
  ('p-050','cat-tofu',50,'Sweet and Sour Tofu','sweet-and-sour-tofu','Tofu, bell pepper, onion, carrot, sweet and sour sauce',800,500,10),
  ('p-051','cat-tofu',51,'Spicy Tofu','spicy-tofu','Tofu, minced pork, garlic, onion, soybean, sate sauce',800,500,20)
ON CONFLICT DO NOTHING;

-- RICE
INSERT INTO products (id, "categoryId", "menuNumber", name, slug, description, "priceCents", "vatRateBps", "sortOrder") VALUES
  ('p-052','cat-rice',52,'Chicken Rice','chicken-rice',NULL,900,500,10),
  ('p-053','cat-rice',53,'Beef Rice','beef-rice',NULL,1000,500,20),
  ('p-054','cat-rice',54,'Seafood Fried Rice','seafood-fried-rice','Rice, shrimp, squid, egg, carrot, onion',950,500,30),
  ('p-055','cat-rice',55,'Vegetable Fried Rice','vegetable-fried-rice','Rice, mixed vegetable',750,500,40),
  ('p-056','cat-rice',56,'Teriyaki Chicken Rice','teriyaki-chicken-rice',NULL,900,500,50),
  ('p-057','cat-rice',57,'Grilled Pork Rice','grilled-pork-rice',NULL,900,500,60),
  ('p-058','cat-rice',58,'Teriyaki Duck Rice','teriyaki-duck-rice','Teriyaki duck served with fried rice',1000,500,70),
  ('p-059','cat-rice',59,'Kung Pao Pork','kung-pao-pork','Pork, carrot, onion, sesame seeds. Served with steamed rice',850,500,80),
  ('p-060','cat-rice',60,'Egg Fried Rice','egg-fried-rice','Rice, egg, fried onion',750,500,90),
  ('p-061','cat-rice',61,'Steamed Rice','steamed-rice',NULL,250,500,100)
ON CONFLICT DO NOTHING;

-- DUCK
INSERT INTO products (id, "categoryId", "menuNumber", name, slug, description, "priceCents", "vatRateBps", "sortOrder") VALUES
  ('p-062','cat-duck',62,'Peking Duck','peking-duck','Duck, rice pancakes, carrot, cucumber, onion, duck sauce',1000,500,10),
  ('p-063','cat-duck',63,'Sweet and Sour Duck','sweet-and-sour-duck','Duck, bell pepper, carrot, pineapple, sweet and sour sauce',1000,500,20)
ON CONFLICT DO NOTHING;

-- SOFT DRINKS (9% VAT)
INSERT INTO products (id, "categoryId", name, slug, "priceCents", "vatRateBps", "sortOrder") VALUES
  ('p-101','cat-soft-drinks','Coca-Cola','coca-cola',      200,900,10),
  ('p-102','cat-soft-drinks','Fanta','fanta',              200,900,20),
  ('p-103','cat-soft-drinks','7 Up','7-up',                200,900,30),
  ('p-104','cat-soft-drinks','Ice Tea','ice-tea',          200,900,40),
  ('p-105','cat-soft-drinks','Soda','soda',                200,900,50),
  ('p-106','cat-soft-drinks','Bitter Lemon','bitter-lemon',200,900,60),
  ('p-107','cat-soft-drinks','Water','water',              100,900,70)
ON CONFLICT DO NOTHING;

-- JUICES (9% VAT)
INSERT INTO products (id, "categoryId", name, slug, "priceCents", "vatRateBps", "sortOrder") VALUES
  ('p-108','cat-juices','Apple Juice','apple-juice',   200,900,10),
  ('p-109','cat-juices','Orange Juice','orange-juice', 200,900,20)
ON CONFLICT DO NOTHING;

-- BEERS — 19% VAT (alcohol is standard-rated), and CRITICALLY:
-- deliveryEligible = FALSE. The Wolt Drive Agreement §2.2–2.3 prohibits
-- delivering products requiring age verification. Pickup only.
INSERT INTO products (id, "categoryId", name, slug, description, "priceCents", "vatRateBps",
                      "containsAlcohol", "deliveryEligible", "pickupEligible", "sortOrder") VALUES
  ('p-110','cat-beers','Carlsberg Beer','carlsberg-beer','Available in 330ml, 500ml and 630ml',200,1900,TRUE,FALSE,TRUE,10),
  ('p-111','cat-beers','Keo Beer','keo-beer','Available in 330ml, 500ml and 630ml',200,1900,TRUE,FALSE,TRUE,20)
ON CONFLICT DO NOTHING;

-- ------------------------------------------ ATTACH MODIFIERS TO PRODUCTS ---
INSERT INTO product_modifier_groups (id, "productId", "groupId", "sortOrder") VALUES
  ('pmg-001','p-001','mg-summer-roll',   10),
  ('pmg-002','p-002','mg-spring-roll',   10),
  ('pmg-005','p-005','mg-dumpling',      10),
  ('pmg-006','p-006','mg-dumpling',      10),
  ('pmg-007','p-007','mg-bun',           10),
  ('pmg-008','p-008','mg-gua-bao',       10),
  ('pmg-012','p-012','mg-salad-protein', 10),
  ('pmg-052','p-052','mg-rice-type',     10),
  ('pmg-053','p-053','mg-rice-type',     10),
  ('pmg-056','p-056','mg-rice-type',     10),
  ('pmg-057','p-057','mg-rice-type',     10),
  ('pmg-110','p-110','mg-beer-size',     10),
  ('pmg-111','p-111','mg-beer-size',     10)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------ DELIVERY PRICING RULES ---
-- Starting position, entirely changeable from the admin dashboard later.
-- Rationale (see docs/WOLT_CONTRACT_ANALYSIS.md §3): free delivery is
-- affordable above roughly €25 even absorbing Wolt's full cost, because
-- avoided marketplace commission scales with basket size while Wolt's fee
-- barely moves. Below that, the customer contributes.
INSERT INTO delivery_pricing_rules (id, priority, "ruleType", config) VALUES
  ('dpr-guard', 10, 'DISTANCE_GUARD',
   '{"maxWoltCostCents": 800, "reason": "Refuse deliveries costing more than €8.00 — beyond ~9km the economics stop working."}'),
  ('dpr-free',  20, 'FREE_ABOVE_THRESHOLD',
   '{"thresholdCents": 2500}'),
  ('dpr-base',  30, 'CAPPED_PASS_THROUGH',
   '{"capCents": 400, "reason": "Below the free-delivery threshold the customer pays Wolt cost up to €4.00 — Hat Gao absorbs any excess."}')
ON CONFLICT DO NOTHING;