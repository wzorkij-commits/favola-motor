export default {
  "_note": "Грамматика персонажа Favola. Манера — общая для всех историй и утверждена на четырёх собранных сказках. Герой в каждой истории свой: у Favola не маскот, а серия. Лист персонажа генерируется на историю и идёт референсом во все шесть кадров.",
  "_legal": "Манера (акварель с карандашом, наивные пропорции, точки вместо глаз, кремовая бумага) не охраняется и заимствуется свободно. Конкретная сборка признаков персонажа из чужой книги охраняется. Поэтому в grammar.forbidden перечислено то, что нельзя собирать вместе, — это опознавательные приметы существующих персонажей, а не запрет на манеру.",
  "grammar": {
    "always": [
      "Круглая голова, крупная относительно тела; тонкие руки и ноги без проработки суставов.",
      "Лицо простое: точки вместо глаз, крошечный нос, бледно-розовые щёки. Ни рта, ни бровей в спокойном кадре.",
      "Тонкая тёмная карандашная линия, без жирного контура.",
      "Приглушённая палитра: пыльно-бирюзовый, олива, терракота, тёплое дерево, мягкий серый.",
      "Много пустой кремовой бумаги вокруг фигуры. Ровный мягкий дневной свет, короткие мягкие тени.",
      "Одежда простая и однотонная либо с одной некрупной фактурой: вязка, вельвет, клетка.",
      "Ни одной детали, которая описывает тело как проблему или как достоинство."
    ],
    "varies_per_story": [
      "Причёска — единственная опознавательная примета, которую ребёнок запоминает.",
      "Один предмет одежды с характером: комбинезон, кардиган, сарафан, свитер с воротом.",
      "Один предмет в руках, связанный с инструментом истории.",
      "Один цветовой акцент из палитры, свой на историю."
    ],
    "forbidden": [
      "Красно-белый горизонтально-полосатый свитер в сочетании с вязаной шапкой и чемоданчиком.",
      "Сердце в стеклянной бутылке на верёвочке как предмет в руках.",
      "Любая сборка признаков, по которой персонажа узнают как героя существующей книги.",
      "Логотипы, надписи и любой текст внутри кадра."
    ]
  },
  "_howto": [
    "1. Лист персонажа делается ПЕРВЫМ: герой в четырёх положениях на пустом кремовом фоне.",
    "2. Утвердить лист глазами. Дальше он идёт референсом в каждый из шести кадров и не меняется.",
    "3. Понравившийся лист можно закрепить: положить base64 в image и поставить approved true — тогда он берётся готовым и не генерируется.",
    "4. Для четырёх собранных сказок правильнее закрепить существующих героев: они уже нарисованы в этой манере и они ваши."
  ],
  "heroes": [
    {
      "id": "dasha",
      "story": "recording",
      "gender": "girl",
      "ages": [
        8,
        12
      ],
      "approved": false,
      "image": null,
      "look": "a girl of about ten with a dark shoulder-length bob pushed behind one ear, small dot eyes, a tiny nose and faint pink cheeks; an olive corduroy pinafore over a long-sleeved cream top, one sock slouched; slightly naive proportions, large head, small hands"
    },
    {
      "id": "chiara",
      "story": "cupboard",
      "gender": "girl",
      "ages": [
        7,
        12
      ],
      "approved": false,
      "image": null,
      "look": "a girl of about nine with two short plaits and a blunt fringe, small dot eyes, a tiny nose and faint pink cheeks; a dusty teal-blue knitted cardigan over a plain skirt, scuffed shoes; slightly naive proportions, large head, small hands"
    },
    {
      "id": "tim",
      "story": "box",
      "gender": "boy",
      "ages": [
        4,
        7
      ],
      "approved": false,
      "image": null,
      "look": "a small boy of about five with soft light hair that sticks up at the crown and ears that stick out, small dot eyes, a tiny nose and faint pink cheeks; a terracotta dungaree over a plain cream long-sleeved top; slightly naive proportions, very large head, small hands"
    },
    {
      "id": "nika",
      "story": "map",
      "gender": "girl",
      "ages": [
        4,
        9
      ],
      "approved": false,
      "image": null,
      "look": "a girl of about six with dark curly hair tied up in a short high tuft, small dot eyes, a tiny nose and faint pink cheeks; a warm wood-brown checked dress with a soft grey collar; slightly naive proportions, large head, small hands"
    },
    {
      "id": "boy-default",
      "gender": "boy",
      "ages": [
        4,
        12
      ],
      "approved": false,
      "image": null,
      "look": "a boy with a round face and short straight hair parted at one side, small dot eyes, a tiny nose and faint pink cheeks; a plain olive jumper with a soft collar and simple trousers; slightly naive proportions, large head, small hands"
    },
    {
      "id": "girl-default",
      "gender": "girl",
      "ages": [
        4,
        12
      ],
      "approved": false,
      "image": null,
      "look": "a girl with a round face and hair tied back in a short ponytail, small dot eyes, a tiny nose and faint pink cheeks; a dusty teal pinafore over a plain long-sleeved top; slightly naive proportions, large head, small hands"
    }
  ]
};
