# Food photos: the list and the brief

For the agent or person making NibbleCue's food photos (the owner, 2026-10-08). There are
**178 foods**. Make one photo per food, check it, and hand the folder back; `docs/FOOD_IMAGES.md`
says how it goes into the app.

The same list with a ready prompt for every food is `tools/foods/food-image-prompts.csv`
(columns `id`, `name`, `prompt`). Use the prompt column as it is; this page is for reading and
checking.

## The brief

- **Look:** a realistic photograph, not an illustration. Shot from directly above, soft natural
  window light, the food on a plain white baby plate on a light wooden table. The same plate,
  table and light in every photo, so the library reads as one set.
- **What is on the plate:** only that food, prepared the way the "How it is served" column says,
  in the amount a parent puts down for one try. No hands, people, babies, text, logos, packaging
  or brands, and no cutlery unless the serving needs a spoon.
- **Size:** square, at least 1024 × 1024. PNG or JPEG.
- **File name:** the food's `id`, exactly, and nothing else: `sweet-potato.png`, `chicken-thigh.jpg`.
  A file with any other name is skipped by the importer.
- **Safety check, every photo:** a photo is a serving instruction for a baby. It must match the
  serving text: soft, the right shape and size, skins and pits off, round foods quartered
  lengthwise, nut butters thinned or spread thin, never whole nuts, never a spoonful of nut butter,
  never coin-shaped carrots or hot dogs. Remake any photo that does not match.
- **Special cases** (the prompt already says so): honey as a thin drizzle over plain yogurt,
  for a toddler over 12 months (it is never planned before then); herbs and spices as a small
  pinch in a tiny bowl beside the mashed food they season; drinks in a small open cup; pouches
  and jars spooned into a small bowl, with a plain unbranded container beside it.

The style sentence every prompt ends with:

> Realistic food photograph, shot from directly above, soft natural window light, on a plain white baby plate on a light wooden table. Square 1:1. Nothing else in frame: no hands, no people, no text, no logos, no packaging, no cutlery unless the serving needs a spoon. Appetizing, true to life colors, shallow depth of field.

## The foods


### Vegetables (37)

| id (file name) | Food | How it is served in the photo |
|---|---|---|
| `sweet-potato` | Sweet potato | Roast or steam until very soft. Mash it, or offer peeled wedges about the size of an adult finger. |
| `butternut-squash` | Butternut squash | Roast or steam until very soft. Mash it, or offer peeled wedges about the size of an adult finger. |
| `pumpkin` | Pumpkin | Steam or roast until very soft. Mash it, or offer peeled wedges that squash easily. |
| `carrot` | Carrot | Cook until it squashes easily between your fingers. Offer finger-size cooked sticks, or mash. |
| `peas` | Peas | Cook until soft, then blend or mash well. |
| `green-beans` | Green beans | Steam whole beans until very soft. Offer them whole, or blend into a puree. |
| `broccoli` | Broccoli | Steam until very soft. Offer a large floret with the stalk as a handle, or blend. |
| `cauliflower` | Cauliflower | Steam until very soft. Offer a large floret with a stalk handle, or mash. |
| `zucchini` | Zucchini | Steam or roast until soft. Offer spears with some skin left on for grip, or mash. |
| `spinach` | Spinach | Cook and blend finely, then stir into a puree or grain. |
| `kale` | Kale | Remove tough stems, cook until very soft and blend into a puree. |
| `collard-greens` | Collard greens | Remove the stems, simmer until very tender and blend. |
| `chard` | Swiss chard | Cook leaves until very soft and blend into a puree. |
| `bell-pepper` | Bell pepper | Roast until soft and peel off the skin. Offer wide strips, or blend. |
| `tomato` | Tomato | Offer large wedges of ripe peeled tomato, or cook and blend into a sauce. |
| `cherry-tomato` | Cherry tomato | Quarter lengthwise, then flatten each piece. Never offer them whole. |
| `beet` | Beet | Roast or boil until very soft, then peel. Offer soft wedges, or mash. |
| `parsnip` | Parsnip | Peel, remove any woody core and roast or steam until very soft. Offer sticks, or mash. |
| `potato` | Potato | Boil or bake until very soft. Mash with some cooking water, or offer soft wedges. |
| `eggplant` | Eggplant | Roast until very soft. Scoop and mash, or offer soft strips with the skin removed. |
| `okra` | Okra | Cook whole pods until very soft. Offer them whole, or mash into a stew. |
| `bok-choy` | Bok choy | Steam until very soft. Offer a soft stem as a stick, or chop and mix in. |
| `cabbage` | Cabbage | Braise until very soft, then blend or chop very finely into other foods. |
| `asparagus` | Asparagus | Trim the woody ends and steam whole spears until very soft. |
| `corn` | Corn | Blend or mash cooked kernels well. |
| `mushroom` | Mushroom | Cook until soft, then blend or chop very finely. |
| `onion` | Onion | Cook until very soft and blend into other foods. |
| `daikon` | Daikon | Peel and simmer until very soft and see-through. Offer soft sticks, or mash. |
| `turnip` | Turnip | Peel and cook until very soft. Mash, or offer soft sticks. |
| `yam` | Yam | Peel, boil until very soft and mash. Or offer soft finger-size pieces. |
| `cassava` | Cassava | Peel, remove the woody core and boil until very soft. Mash well with some cooking water. |
| `taro` | Taro | Peel, then boil until very soft and mash with some cooking water. |
| `callaloo` | Callaloo | Steam the leaves until very soft and blend into a puree. |
| `breadfruit` | Breadfruit | Peel, then boil or roast until very soft. Mash, or offer soft sticks. |
| `chayote` | Chayote | Peel, remove the seed and cook until very soft. Offer sticks, or mash. |
| `brussels-sprouts` | Brussels sprouts | Cook until very soft and mash, or blend into other vegetables. |
| `bottle-gourd` | Bottle gourd | Peel, remove seeds and cook until very soft. Mash or blend. |

### Fruit (26)

| id (file name) | Food | How it is served in the photo |
|---|---|---|
| `avocado` | Avocado | Mash ripe avocado, or offer thick spears. Rolling spears in infant cereal makes them easier to hold. |
| `banana` | Banana | Mash ripe banana, or offer a large piece of ripe banana to hold. |
| `apple` | Apple | Cook until very soft. Offer cooked wedges that squash easily, or puree. |
| `applesauce` | Applesauce | Choose unsweetened applesauce, or cook and blend your own. Offer from a preloaded spoon. |
| `pear` | Pear | Use very ripe pear, or cook it until soft. Offer peeled wedges that squash easily, or puree. |
| `peach` | Peach | Offer ripe, peeled wedges with the pit removed, or puree. |
| `plum` | Plum | Offer ripe, peeled wedges with the pit removed, or cook and puree. |
| `prune` | Prune | Soak or simmer pitted prunes until very soft, then blend. |
| `mango` | Mango | Offer ripe, peeled spears, or mash. |
| `papaya` | Papaya | Scoop out the seeds of a ripe papaya. Mash it, or offer peeled spears. |
| `kiwi` | Kiwi | Peel ripe kiwi and offer thick spears, or mash. |
| `strawberry` | Strawberry | Mash ripe strawberries, or cut them into thin slices. |
| `blueberry` | Blueberry | Flatten each berry between your fingers until it bursts, or mash. |
| `raspberry` | Raspberry | Offer ripe raspberries whole, since they squash easily, or mash. |
| `blackberry` | Blackberry | Mash, or cut large berries into quarters. |
| `orange` | Orange | Remove the peel, seeds and membranes. Offer the flesh flattened or chopped small. |
| `melon` | Melon | Offer very ripe, soft melon in finger-size sticks with the rind removed, or mash. |
| `watermelon` | Watermelon | Offer seedless sticks with the rind removed, or mash. |
| `guava` | Guava | Peel ripe guava, scoop out the seeds, then mash or blend. Strain out any seeds. |
| `pineapple` | Pineapple | Remove the core. Blend or mash very ripe pineapple. |
| `cherry` | Cherry | Remove the pit and stem, then quarter and flatten, or mash. |
| `date` | Date | Remove the pit, soak in warm water, then blend into a smooth paste. |
| `fig` | Fig | Remove the stem. Offer ripe fresh figs in quarters, or mash. |
| `apricot` | Apricot | Offer ripe, peeled halves with the pit removed, or cook and puree. |
| `plantain` | Plantain | Steam, boil or bake ripe plantain until very soft. Offer sticks, or mash. |
| `grapes` | Grapes | Quarter lengthwise and flatten each piece, or mash. |

### Grains, breads and cereals (30)

| id (file name) | Food | How it is served in the photo |
|---|---|---|
| `infant-oat-cereal` | Iron-fortified oat cereal | Mix with breast milk, formula or water until smooth and runny, and offer from a spoon, never a bottle. |
| `infant-multigrain-cereal` | Iron-fortified multigrain cereal | Mix with breast milk, formula or water until smooth and runny, and offer from a spoon, never a bottle. |
| `infant-rice-cereal` | Iron-fortified rice cereal | Mix with breast milk, formula or water until smooth and runny, and offer from a spoon, never a bottle. |
| `oatmeal` | Oatmeal | Cook oats until very soft, then blend or mash with breast milk, formula or water. |
| `bread` | Plain bread | Lightly toast and cut into finger-size strips. Top with a thin layer of a soft spread. |
| `pasta` | Pasta | Cook until very soft. Offer large shapes like penne or fusilli, or chop finely. |
| `couscous` | Couscous | Cook until soft and mix with a puree so it holds together. |
| `farina` | Farina | Cook with water, breast milk or formula until smooth and runny. |
| `quinoa` | Quinoa | Rinse, cook until very soft and mash or mix into a puree. |
| `rice` | Rice | Cook with extra water until very soft, then mash or mix into a puree. |
| `brown-rice` | Brown rice | Cook with extra water until very soft, then mash or mix into a puree. |
| `congee` | Congee | Cook rice with plenty of water until very soft, then blend or mash. |
| `idli` | Idli | Steam until soft and fluffy. Mash with a little dal, or offer strips. |
| `roti` | Roti | Offer soft roti in thin strips, or soak small pieces in dal. |
| `khichdi` | Khichdi | Cook rice and split moong dal with extra water until very soft, then mash or blend. |
| `corn-tortilla` | Corn tortilla | Warm until soft and cut into thin strips. |
| `flour-tortilla` | Flour tortilla | Warm until soft and cut into thin strips. |
| `pita` | Pita | Warm lightly and cut into thin strips. |
| `arepa` | Arepa | Cook through, then cut the soft inside into strips, without the crisp crust. |
| `polenta` | Polenta | Cook until smooth and soft. Serve it creamy, or let it set and cut into soft sticks. |
| `millet` | Millet | Cook with extra water until very soft, then blend or mash into a porridge. |
| `ragi` | Ragi | Cook ragi flour with water, stirring well, until smooth and runny. |
| `barley` | Barley | Cook until very soft, then mash or blend into soups. |
| `freekeh` | Freekeh | Cook until very soft, then mash or mix into a puree. |
| `bulgur` | Bulgur | Cook fine bulgur until very soft and mix with a puree. |
| `semolina` | Semolina | Cook into a smooth porridge with water, breast milk or formula. |
| `rice-noodles` | Rice noodles | Cook until very soft. Offer a small bundle of noodles, or chop them short. |
| `udon` | Udon | Cook until very soft. Offer a few noodles to grab, or chop them short. |
| `buckwheat` | Buckwheat | Cook groats until very soft, then blend or mash into a porridge. |
| `pancake` | Pancake | Cook through and cut into finger-size strips. |

### Meat (7)

| id (file name) | Food | How it is served in the photo |
|---|---|---|
| `beef` | Beef | Cook until no pink remains. Blend with cooking liquid, offer soft ground beef, or a large strip of slow-cooked beef to suck on. |
| `lamb` | Lamb | Cook until tender and no pink remains. Blend with cooking liquid, or offer soft ground lamb or a large tender strip. |
| `chicken-thigh` | Chicken thigh | Cook through, remove skin and bones, then blend, shred finely or offer a large tender strip. |
| `chicken-breast` | Chicken breast | Cook through, then blend with cooking liquid or shred very finely. |
| `turkey` | Turkey | Cook through, then blend with cooking liquid, or offer soft ground turkey. |
| `pork` | Pork | Cook until tender and cooked through. Blend, shred finely or offer a large tender strip. |
| `goat` | Goat | Slow cook until very tender and remove every bone. Blend, shred finely or offer a large tender strip. |

### Fish and shellfish (11)

| id (file name) | Food | How it is served in the photo |
|---|---|---|
| `salmon` | Salmon | Cook until it flakes easily. Check carefully for bones, then flake or mash. |
| `cod` | Cod | Bake or steam until it flakes easily. Check for bones, then flake or mash. |
| `sardines` | Sardines | Choose canned sardines in water or olive oil with no added salt. Mash well, soft bones and all. |
| `light-tuna` | Canned light tuna | Choose canned light tuna packed in water. Mash with a little avocado or olive oil. |
| `trout` | Trout | Cook until it flakes easily. Check carefully for bones, then flake or mash. |
| `tilapia` | Tilapia | Bake or steam until it flakes easily. Check for bones, then flake or mash. |
| `catfish` | Catfish | Bake or steam until it flakes easily. Check for bones, then flake or mash. |
| `shrimp` | Shrimp | Cook until pink and opaque all the way through, then chop very finely or blend. |
| `crab` | Crab | Use fully cooked crab meat. Pick through for shell pieces, then chop finely or mash. |
| `lobster` | Lobster | Cook until opaque all the way through. Remove all shell, then chop very finely or blend. |
| `scallop` | Scallop | Cook until opaque all the way through, then chop very finely or blend. |

### Eggs (1)

| id (file name) | Food | How it is served in the photo |
|---|---|---|
| `egg` | Egg | Cook until the white and yolk are fully firm. Mash hard-boiled egg with breast milk or formula, or cut a thin omelet into strips. |

### Dairy (8)

| id (file name) | Food | How it is served in the photo |
|---|---|---|
| `plain-yogurt` | Plain whole-milk yogurt | Choose plain, whole-milk yogurt with no added sugar. Offer from a preloaded spoon. |
| `cheese` | Cheese | Choose a pasteurized, lower-sodium cheese. Melt shredded cheese into food, or offer thin, wide slices. |
| `cottage-cheese` | Cottage cheese | Choose pasteurized whole-milk cottage cheese. Mash small curds, or mix into fruit. |
| `ricotta` | Ricotta | Choose pasteurized whole-milk ricotta. Offer from a preloaded spoon, or stir into a puree. |
| `mozzarella` | Mozzarella | Choose pasteurized mozzarella. Melt shredded cheese into food, or offer thin, wide slices. |
| `paneer` | Paneer | Use soft homemade or pasteurized paneer. Crumble finely, or offer thin, wide strips. |
| `labneh` | Labneh | Offer plain labneh from a preloaded spoon, or spread thinly on a soft food. |
| `cows-milk` | Cow's milk in cooking | Use whole cow's milk in cooking, like oatmeal or mashed potato. Not as a drink before 12 months. |

### Beans, lentils and soy (17)

| id (file name) | Food | How it is served in the photo |
|---|---|---|
| `red-lentils` | Red lentils | Cook until very soft and falling apart, then blend or mash. |
| `green-lentils` | Green lentils | Cook until very soft, then blend or mash. |
| `mung-beans` | Mung beans | Cook split moong dal until very soft and blend or mash. |
| `black-beans` | Black beans | Cook until very soft, or rinse canned beans, then mash or blend. |
| `pinto-beans` | Pinto beans | Cook until very soft, or rinse canned beans, then mash or blend. |
| `kidney-beans` | Kidney beans | Use canned beans, rinsed, or dried beans soaked and boiled until very soft. Mash or blend. |
| `white-beans` | White beans | Cook until very soft, or rinse canned beans, then mash or blend. |
| `chickpeas` | Chickpeas | Cook until very soft, or rinse canned chickpeas, then mash or blend. Remove skins for a smoother mash. |
| `hummus` | Hummus | Offer from a preloaded spoon, or spread thinly on a soft food. Choose one low in salt, or make your own. |
| `black-eyed-peas` | Black-eyed peas | Cook until very soft, or rinse canned peas, then mash or blend. |
| `split-peas` | Split peas | Simmer until they fall apart into a soft mash. |
| `pigeon-peas` | Pigeon peas | Cook split toor dal or whole peas until very soft, then mash or blend. |
| `adzuki-beans` | Adzuki beans | Soak and cook until very soft, then mash or blend. |
| `tofu` | Tofu | Mash soft or silken tofu, or warm firm tofu and cut it into finger-size strips. |
| `tempeh` | Tempeh | Steam or simmer until soft, then crumble finely or mash into a puree. |
| `edamame` | Edamame | Remove from the pod, cook until very soft and mash or blend. |
| `soy-yogurt` | Soy yogurt | Choose plain, unsweetened soy yogurt. Offer from a preloaded spoon. |

### Nuts and seeds (13)

| id (file name) | Food | How it is served in the photo |
|---|---|---|
| `peanut-butter` | Peanut butter | Use smooth peanut butter. Thin it with warm water, breast milk or formula, or stir it into a puree. Spread only a thin layer. |
| `peanut-powder` | Peanut powder | Stir a small amount into a smooth puree like oatmeal or applesauce until fully blended. |
| `almond-butter` | Almond butter | Thin smooth almond butter with warm water, or stir finely ground almonds into a puree. Spread only a thin layer. |
| `cashew-butter` | Cashew butter | Thin smooth cashew butter with warm water, or stir finely ground cashews into a puree. Spread only a thin layer. |
| `walnut-butter` | Walnut butter | Stir finely ground walnuts or smooth walnut butter into a puree. Spread only a thin layer. |
| `pecan-butter` | Pecan butter | Stir finely ground pecans or smooth pecan butter into a puree. Spread only a thin layer. |
| `pistachio-butter` | Pistachio butter | Stir finely ground unsalted pistachios or smooth pistachio butter into a puree. Spread only a thin layer. |
| `hazelnut-butter` | Hazelnut butter | Stir finely ground hazelnuts or smooth hazelnut butter into a puree. Spread only a thin layer. |
| `tahini` | Tahini | Thin with warm water, or stir a little into a puree. Spread only a thin layer. |
| `sunflower-seed-butter` | Sunflower seed butter | Thin smooth sunflower seed butter with warm water, or stir it into a puree. Spread only a thin layer. |
| `chia-seeds` | Chia seeds | Grind them, or soak in liquid until they form a gel, then stir into a puree. |
| `ground-flaxseed` | Ground flaxseed | Stir a small amount of ground flaxseed into oatmeal or a puree. |
| `hemp-seeds` | Hemp seeds | Stir shelled hemp hearts into a puree or oatmeal. |

### Oils and fats (4)

| id (file name) | Food | How it is served in the photo |
|---|---|---|
| `olive-oil` | Olive oil | Stir a little into purees, mashed vegetables or grains. |
| `butter` | Butter | Use unsalted butter. Melt a little into vegetables or grains. |
| `ghee` | Ghee | Stir a little into dal, khichdi or mashed vegetables. |
| `coconut-milk` | Coconut milk | Stir canned coconut milk into purees, rice or curries. Not as a drink. |

### Herbs and spices (14)

| id (file name) | Food | How it is served in the photo |
|---|---|---|
| `garlic` | Garlic | A little minced garlic in a tiny white bowl, beside a spoonful of mashed lentils it is cooked into. |
| `ginger` | Ginger | A little minced ginger in a tiny white bowl, beside a spoonful of mashed lentils it is cooked into. |
| `cinnamon` | Cinnamon | A small pinch of ground cinnamon in a tiny white bowl, beside a spoonful of mashed sweet potato it is mixed into. |
| `cumin` | Cumin | A small pinch of ground cumin in a tiny white bowl, beside a spoonful of mashed sweet potato it is mixed into. |
| `turmeric` | Turmeric | A small pinch of ground turmeric in a tiny white bowl, beside a spoonful of mashed sweet potato it is mixed into. |
| `cardamom` | Cardamom | A small pinch of ground cardamom in a tiny white bowl, beside a spoonful of mashed sweet potato it is mixed into. |
| `cilantro` | Cilantro | A little finely chopped fresh cilantro in a tiny white bowl, beside a spoonful of mashed sweet potato it is stirred into. |
| `basil` | Basil | A little finely chopped fresh basil in a tiny white bowl, beside a spoonful of mashed sweet potato it is stirred into. |
| `mint` | Mint | A little finely chopped fresh mint in a tiny white bowl, beside a spoonful of mashed sweet potato it is stirred into. |
| `dill` | Dill | A little finely chopped fresh dill in a tiny white bowl, beside a spoonful of mashed sweet potato it is stirred into. |
| `oregano` | Oregano | A little finely chopped fresh oregano in a tiny white bowl, beside a spoonful of mashed sweet potato it is stirred into. |
| `paprika` | Paprika | A small pinch of ground paprika in a tiny white bowl, beside a spoonful of mashed sweet potato it is mixed into. |
| `parsley` | Parsley | A little finely chopped fresh parsley in a tiny white bowl, beside a spoonful of mashed sweet potato it is stirred into. |
| `honey` | Honey | a thin drizzle over plain yogurt in a small white bowl. |

### Drinks (4)

| id (file name) | Food | How it is served in the photo |
|---|---|---|
| `water` | Water | Water in a small clear open cup made for babies. |
| `cows-milk-drink` | Cow's milk to drink | Cow's milk to drink in a small clear open cup made for babies. |
| `fruit-juice` | Fruit juice | Fruit juice in a small clear open cup made for babies. |
| `soy-milk-drink` | Soy milk to drink | Soy milk to drink in a small clear open cup made for babies. |

### Pouches and jars (6)

| id (file name) | Food | How it is served in the photo |
|---|---|---|
| `fruit-pouch` | Fruit pouch | Fruit pouch, its contents spooned into a small white bowl, the plain unbranded container beside it. |
| `veggie-pouch` | Veggie pouch | Veggie pouch, its contents spooned into a small white bowl, the plain unbranded container beside it. |
| `jarred-puree` | Jarred baby food | Jarred baby food, its contents spooned into a small white bowl, the plain unbranded container beside it. |
| `baby-puffs` | Baby puffs | Baby puffs, its contents spooned into a small white bowl, the plain unbranded container beside it. |
| `teething-wafer` | Teething wafer | Teething wafer, its contents spooned into a small white bowl, the plain unbranded container beside it. |
| `yogurt-melts` | Yogurt melts | Yogurt melts, its contents spooned into a small white bowl, the plain unbranded container beside it. |
