// Datos de ejemplo: 3 restaurantes de Asunción con menús, modificadores y macros.
// Los macros son valores aproximados de referencia para desarrollo.

import type { Allergen, PlanPeriodMode, SlotScope } from "../../src/generated/prisma/enums";

export type Macros = {
  servingGrams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
};

export type DeltaDef = Partial<{
  kcalDelta: number;
  proteinDeltaG: number;
  carbsDeltaG: number;
  fatDeltaG: number;
  fiberDeltaG: number;
  sugarDeltaG: number;
  sodiumDeltaMg: number;
}>;

export type OptionDef = {
  key: string;
  name: string;
  priceDelta?: number;
  isDefault?: boolean;
  dailyStock?: number;
  tag?: string;
  delta?: DeltaDef;
};

export type GroupDef = {
  key: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: OptionDef[];
};

export type DishDef = {
  key: string;
  name: string;
  description: string;
  category: string;
  basePrice: number;
  allowNotes?: boolean;
  macros: Macros | null;
  groups: string[]; // en orden de visualización para este plato
  weekdays: number[]; // ISO 1..7
  dailyStock: number;
};

export type SlotDef = { weekdays: number[]; start: string; end: string; capacity: number; scope: SlotScope };

export type RestaurantDef = {
  key: string;
  slug: string;
  name: string;
  description: string;
  zone: string;
  addressLine: string;
  phone: string;
  cuisines: string[];
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  deliveryZones: { zone: string; fee: number }[];
  cutoffDaysBefore: number;
  cutoffMinute: number;
  commissionBps: number;
  restaurantCancelRefundsCommission: boolean;
  restaurantCancelPenaltyBps: number;
  customerCancelRefundBps: number;
  macrosRequired: boolean;
  openingHours: { weekdays: number[]; open: string; close: string }[];
  discountTiers: { minHoursBefore: number; discountBps: number }[];
  plan: null | {
    discountBps: number;
    weekdays: number[];
    periodMode: PlanPeriodMode;
    signupDeadlineDay: number;
    minDays: number;
    cancelDaysBefore: number;
    cancelMinute: number;
    cancelRefundBps: number;
  };
  owner: { name: string; email: string };
  categories: string[];
  groups: GroupDef[];
  dishes: DishDef[];
  slots: SlotDef[];
};

const MON_FRI = [1, 2, 3, 4, 5];
const MON_SAT = [1, 2, 3, 4, 5, 6];
const TUE_SUN = [2, 3, 4, 5, 6, 7];

export const ZONES = [
  { slug: "centro", name: "Centro" },
  { slug: "sajonia", name: "Sajonia" },
  { slug: "recoleta", name: "Recoleta" },
  { slug: "villa-morra", name: "Villa Morra" },
  { slug: "carmelitas", name: "Carmelitas" },
  { slug: "las-mercedes", name: "Las Mercedes" },
];

export const CUISINES = [
  { slug: "casera", name: "Comida casera" },
  { slug: "saludable", name: "Saludable" },
  { slug: "parrilla", name: "Parrilla" },
  { slug: "vegetariana", name: "Opciones vegetarianas" },
  { slug: "minutas", name: "Minutas" },
];

export const PREFERENCE_TAGS = [
  { slug: "sin-cebolla", label: "Sin cebolla", kind: "REMOVE_INGREDIENT" },
  { slug: "sin-tomate", label: "Sin tomate", kind: "REMOVE_INGREDIENT" },
  { slug: "jugoso", label: "Carne jugosa", kind: "COOKING" },
  { slug: "a-punto", label: "Carne a punto", kind: "COOKING" },
  { slug: "bien-cocido", label: "Carne bien cocida", kind: "COOKING" },
  { slug: "tostadito", label: "Bien tostadito", kind: "COOKING" },
] as const;

export const RESTAURANTS: RestaurantDef[] = [
  {
    key: "rosa",
    slug: "la-cocina-de-dona-rosa",
    name: "La Cocina de Doña Rosa",
    description: "Comida casera paraguaya, como en casa. Menú del día que rota cada semana.",
    zone: "centro",
    addressLine: "Estrella 845 c/ Montevideo",
    phone: "0981 555 101",
    cuisines: ["casera", "minutas"],
    pickupEnabled: true,
    deliveryEnabled: true,
    deliveryZones: [
      { zone: "centro", fee: 8_000 },
      { zone: "sajonia", fee: 10_000 },
      { zone: "recoleta", fee: 12_000 },
    ],
    cutoffDaysBefore: 1,
    cutoffMinute: 20 * 60,
    commissionBps: 1000,
    restaurantCancelRefundsCommission: true,
    restaurantCancelPenaltyBps: 0,
    customerCancelRefundBps: 10_000,
    macrosRequired: false,
    openingHours: [{ weekdays: MON_FRI, open: "11:00", close: "14:30" }],
    discountTiers: [
      { minHoursBefore: 24, discountBps: 1000 },
      { minHoursBefore: 72, discountBps: 1500 },
    ],
    plan: {
      discountBps: 2000,
      weekdays: MON_FRI,
      periodMode: "NEXT_MONTH",
      signupDeadlineDay: 25,
      minDays: 5,
      cancelDaysBefore: 1,
      cancelMinute: 18 * 60,
      cancelRefundBps: 10_000,
    },
    owner: { name: "Rosa Benítez", email: "rosa@prepago.test" },
    categories: ["Platos del día", "Acompañamientos", "Postres"],
    groups: [
      {
        key: "punto-mila",
        name: "Punto de la milanesa",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          { key: "normal", name: "Normal", isDefault: true },
          { key: "tostadita", name: "Tostadita", tag: "tostadito", delta: { kcalDelta: 20, fatDeltaG: 2 } },
        ],
      },
      {
        key: "guarnicion",
        name: "Guarnición",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          { key: "pure", name: "Puré de papas", isDefault: true },
          {
            key: "fritas",
            name: "Papas fritas",
            priceDelta: 3_000,
            delta: { kcalDelta: 180, carbsDeltaG: 20, fatDeltaG: 10 },
          },
          {
            key: "ensalada",
            name: "Ensalada mixta",
            delta: { kcalDelta: -200, carbsDeltaG: -30, fatDeltaG: -5, fiberDeltaG: 3 },
          },
          { key: "arroz", name: "Arroz blanco", delta: { kcalDelta: -20, carbsDeltaG: 4, fatDeltaG: -4 } },
        ],
      },
      {
        key: "quitar",
        name: "Quitar ingredientes",
        required: false,
        minSelect: 0,
        maxSelect: 3,
        options: [
          { key: "sin-cebolla", name: "Sin cebolla", tag: "sin-cebolla" },
          { key: "sin-tomate", name: "Sin tomate", tag: "sin-tomate" },
          { key: "sin-huevo", name: "Sin huevo", delta: { kcalDelta: -80, proteinDeltaG: -6, fatDeltaG: -5 } },
        ],
      },
      {
        key: "extras",
        name: "Extras",
        required: false,
        minSelect: 0,
        maxSelect: 3,
        options: [
          {
            key: "extra-queso",
            name: "Extra queso",
            priceDelta: 5_000,
            dailyStock: 15,
            delta: { kcalDelta: 110, proteinDeltaG: 7, fatDeltaG: 9, sodiumDeltaMg: 180 },
          },
          {
            key: "huevo-frito",
            name: "Huevo frito",
            priceDelta: 4_000,
            delta: { kcalDelta: 90, proteinDeltaG: 6, fatDeltaG: 7 },
          },
          {
            key: "napolitana",
            name: "A la napolitana",
            priceDelta: 8_000,
            delta: { kcalDelta: 180, proteinDeltaG: 10, carbsDeltaG: 3, fatDeltaG: 12, sodiumDeltaMg: 250 },
          },
        ],
      },
    ],
    dishes: [
      {
        key: "milanesa",
        name: "Milanesa de carne",
        description: "Milanesa de nalga a la sartén con guarnición a elección.",
        category: "Platos del día",
        basePrice: 35_000,
        allowNotes: true,
        macros: { servingGrams: 380, kcal: 720, proteinG: 42, carbsG: 58, fatG: 34, fiberG: 4, sodiumMg: 1100 },
        groups: ["punto-mila", "guarnicion", "quitar", "extras"],
        weekdays: [1, 2, 4],
        dailyStock: 30,
      },
      {
        key: "vori",
        name: "Vorí vorí de gallina",
        description: "Sopa espesa con bolitas de maíz y queso, y gallina casera.",
        category: "Platos del día",
        basePrice: 30_000,
        macros: { servingGrams: 450, kcal: 480, proteinG: 28, carbsG: 52, fatG: 16, sodiumMg: 1300 },
        groups: ["extras"],
        weekdays: [1, 3],
        dailyStock: 25,
      },
      {
        key: "bife-koygua",
        name: "Bife koygua",
        description: "Bife a la criolla con cebolla, tomate y huevo, con guarnición.",
        category: "Platos del día",
        basePrice: 38_000,
        allowNotes: true,
        macros: { servingGrams: 400, kcal: 690, proteinG: 40, carbsG: 55, fatG: 30, fiberG: 3, sodiumMg: 950 },
        groups: ["guarnicion", "quitar"],
        weekdays: [2, 5],
        dailyStock: 20,
      },
      {
        key: "pollo-horno",
        name: "Pollo al horno",
        description: "Cuarto de pollo al horno con hierbas y guarnición.",
        category: "Platos del día",
        basePrice: 33_000,
        macros: { servingGrams: 420, kcal: 640, proteinG: 45, carbsG: 48, fatG: 26, fiberG: 3, sodiumMg: 800 },
        groups: ["guarnicion", "quitar"],
        weekdays: [3, 5],
        dailyStock: 25,
      },
      {
        key: "tallarin",
        name: "Tallarín casero con tuco",
        description: "Tallarines amasados con salsa de tomate y carne.",
        category: "Platos del día",
        basePrice: 28_000,
        macros: { servingGrams: 400, kcal: 610, proteinG: 22, carbsG: 88, fatG: 16, fiberG: 5, sodiumMg: 900 },
        groups: ["extras"],
        weekdays: [4],
        dailyStock: 20,
      },
      {
        key: "sopa-paraguaya",
        name: "Sopa paraguaya (porción)",
        description: "Porción de sopa paraguaya recién horneada.",
        category: "Acompañamientos",
        basePrice: 12_000,
        macros: null,
        groups: [],
        weekdays: MON_FRI,
        dailyStock: 40,
      },
      {
        key: "flan",
        name: "Flan casero con dulce de leche",
        description: "Postre de la casa.",
        category: "Postres",
        basePrice: 10_000,
        macros: { servingGrams: 150, kcal: 260, proteinG: 7, carbsG: 38, fatG: 9, sugarG: 32 },
        groups: [],
        weekdays: MON_FRI,
        dailyStock: 20,
      },
    ],
    slots: [
      { weekdays: MON_FRI, start: "11:30", end: "12:00", capacity: 12, scope: "BOTH" },
      { weekdays: MON_FRI, start: "12:00", end: "12:30", capacity: 15, scope: "BOTH" },
      { weekdays: MON_FRI, start: "12:30", end: "13:00", capacity: 15, scope: "BOTH" },
      { weekdays: MON_FRI, start: "13:00", end: "13:30", capacity: 10, scope: "BOTH" },
    ],
  },
  {
    key: "fit",
    slug: "fit-bowl",
    name: "Fit Bowl",
    description: "Bowls, wraps y ensaladas con macros a la vista. Ideal para tu plan semanal.",
    zone: "villa-morra",
    addressLine: "Av. Mcal. López 3811",
    phone: "0982 555 202",
    cuisines: ["saludable", "vegetariana"],
    pickupEnabled: true,
    deliveryEnabled: true,
    deliveryZones: [
      { zone: "villa-morra", fee: 7_000 },
      { zone: "recoleta", fee: 7_000 },
      { zone: "carmelitas", fee: 9_000 },
      { zone: "las-mercedes", fee: 9_000 },
    ],
    cutoffDaysBefore: 1,
    cutoffMinute: 21 * 60,
    commissionBps: 1200,
    restaurantCancelRefundsCommission: true,
    restaurantCancelPenaltyBps: 0,
    customerCancelRefundBps: 8_000,
    macrosRequired: true,
    openingHours: [
      { weekdays: MON_SAT, open: "11:00", close: "14:00" },
      { weekdays: MON_SAT, open: "18:30", close: "21:00" },
    ],
    discountTiers: [
      { minHoursBefore: 24, discountBps: 800 },
      { minHoursBefore: 48, discountBps: 1200 },
      { minHoursBefore: 168, discountBps: 1500 },
    ],
    plan: {
      discountBps: 1500,
      weekdays: MON_SAT,
      periodMode: "REST_OF_MONTH_AND_NEXT",
      signupDeadlineDay: 28,
      minDays: 4,
      cancelDaysBefore: 1,
      cancelMinute: 21 * 60,
      cancelRefundBps: 9_000,
    },
    owner: { name: "Gabriel Sosa", email: "fit@prepago.test" },
    categories: ["Bowls", "Wraps y ensaladas"],
    groups: [
      {
        key: "base",
        name: "Base",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          { key: "integral", name: "Arroz integral", isDefault: true },
          {
            key: "quinoa",
            name: "Quinoa",
            priceDelta: 3_000,
            delta: { kcalDelta: 10, proteinDeltaG: 2, carbsDeltaG: -2, fiberDeltaG: 1 },
          },
          {
            key: "hojas",
            name: "Mix de hojas",
            delta: { kcalDelta: -150, carbsDeltaG: -32, fiberDeltaG: 2 },
          },
        ],
      },
      {
        key: "extras-fit",
        name: "Extras",
        required: false,
        minSelect: 0,
        maxSelect: 2,
        options: [
          {
            key: "palta",
            name: "Palta",
            priceDelta: 5_000,
            delta: { kcalDelta: 120, carbsDeltaG: 6, fatDeltaG: 11, fiberDeltaG: 5 },
          },
          {
            key: "huevo-duro",
            name: "Huevo duro",
            priceDelta: 3_000,
            delta: { kcalDelta: 70, proteinDeltaG: 6, fatDeltaG: 5, sodiumDeltaMg: 60 },
          },
          {
            key: "proteina-extra",
            name: "Proteína extra",
            priceDelta: 9_000,
            dailyStock: 12,
            delta: { kcalDelta: 150, proteinDeltaG: 28, fatDeltaG: 4, sodiumDeltaMg: 120 },
          },
        ],
      },
      {
        key: "aderezo",
        name: "Aderezo",
        required: false,
        minSelect: 0,
        maxSelect: 1,
        options: [
          { key: "yogur", name: "Yogur y hierbas", isDefault: true },
          { key: "limon", name: "Limón y oliva", delta: { kcalDelta: 40, fatDeltaG: 4 } },
          { key: "sin-aderezo", name: "Sin aderezo", delta: { kcalDelta: -45, carbsDeltaG: -2, fatDeltaG: -3 } },
        ],
      },
      {
        key: "quitar-fit",
        name: "Quitar",
        required: false,
        minSelect: 0,
        maxSelect: 2,
        options: [
          { key: "sin-cebolla", name: "Sin cebolla", tag: "sin-cebolla" },
          { key: "sin-tomate", name: "Sin tomate", tag: "sin-tomate" },
        ],
      },
    ],
    dishes: [
      {
        key: "bowl-pollo",
        name: "Bowl de pollo grillado",
        description: "Pollo grillado, vegetales asados, base a elección y aderezo.",
        category: "Bowls",
        basePrice: 42_000,
        macros: { servingGrams: 420, kcal: 540, proteinG: 45, carbsG: 52, fatG: 14, fiberG: 8, sugarG: 6, sodiumMg: 650 },
        groups: ["base", "extras-fit", "aderezo", "quitar-fit"],
        weekdays: MON_SAT,
        dailyStock: 40,
      },
      {
        key: "bowl-salmon",
        name: "Bowl de salmón",
        description: "Salmón rosado, pepino, edamame y base a elección.",
        category: "Bowls",
        basePrice: 58_000,
        macros: { servingGrams: 400, kcal: 610, proteinG: 38, carbsG: 48, fatG: 26, fiberG: 7, sugarG: 5, sodiumMg: 700 },
        groups: ["base", "extras-fit", "aderezo"],
        weekdays: [2, 4, 6],
        dailyStock: 20,
      },
      {
        key: "bowl-veggie",
        name: "Bowl vegano de garbanzos",
        description: "Garbanzos especiados, calabaza asada, hojas verdes y semillas.",
        category: "Bowls",
        basePrice: 38_000,
        macros: { servingGrams: 400, kcal: 520, proteinG: 21, carbsG: 70, fatG: 16, fiberG: 14, sugarG: 9, sodiumMg: 480 },
        groups: ["base", "extras-fit", "aderezo"],
        weekdays: MON_SAT,
        dailyStock: 20,
      },
      {
        key: "wrap",
        name: "Wrap integral de pollo",
        description: "Tortilla integral con pollo, lechuga, tomate y cebolla morada.",
        category: "Wraps y ensaladas",
        basePrice: 35_000,
        allowNotes: true,
        macros: { servingGrams: 300, kcal: 460, proteinG: 32, carbsG: 45, fatG: 15, fiberG: 6, sugarG: 4, sodiumMg: 820 },
        groups: ["quitar-fit", "aderezo"],
        weekdays: MON_FRI,
        dailyStock: 30,
      },
      {
        key: "cesar",
        name: "Ensalada César liviana",
        description: "Lechuga romana, pollo, parmesano y croutons integrales.",
        category: "Wraps y ensaladas",
        basePrice: 36_000,
        macros: { servingGrams: 320, kcal: 390, proteinG: 30, carbsG: 22, fatG: 20, fiberG: 4, sugarG: 3, sodiumMg: 760 },
        groups: ["extras-fit", "aderezo"],
        weekdays: [1, 3, 5],
        dailyStock: 25,
      },
    ],
    slots: [
      { weekdays: MON_SAT, start: "11:30", end: "12:00", capacity: 20, scope: "BOTH" },
      { weekdays: MON_SAT, start: "12:00", end: "12:30", capacity: 20, scope: "BOTH" },
      { weekdays: MON_SAT, start: "12:30", end: "13:00", capacity: 20, scope: "BOTH" },
      { weekdays: MON_SAT, start: "19:00", end: "19:30", capacity: 10, scope: "DELIVERY" },
      { weekdays: MON_SAT, start: "19:30", end: "20:00", capacity: 10, scope: "DELIVERY" },
    ],
  },
  {
    key: "quincho",
    slug: "parrilla-el-quincho",
    name: "Parrilla El Quincho",
    description: "Carnes a la parrilla y hamburguesas. Elegí el punto exacto de tu carne.",
    zone: "carmelitas",
    addressLine: "Senador Long 560",
    phone: "0983 555 303",
    cuisines: ["parrilla"],
    pickupEnabled: true,
    deliveryEnabled: false,
    deliveryZones: [],
    cutoffDaysBefore: 0,
    cutoffMinute: 10 * 60,
    commissionBps: 1000,
    // Acuerdo distinto: si cancela, absorbe la comisión y paga 5% de penalidad.
    restaurantCancelRefundsCommission: false,
    restaurantCancelPenaltyBps: 500,
    customerCancelRefundBps: 10_000,
    macrosRequired: false,
    openingHours: [
      { weekdays: TUE_SUN, open: "11:30", close: "15:00" },
      { weekdays: TUE_SUN, open: "19:30", close: "23:30" },
    ],
    discountTiers: [{ minHoursBefore: 24, discountBps: 1000 }],
    plan: null,
    owner: { name: "Ramón Ayala", email: "quincho@prepago.test" },
    categories: ["Parrilla", "Hamburguesas y lomitos"],
    groups: [
      {
        key: "punto",
        name: "Punto de cocción",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          { key: "jugoso", name: "Jugoso", tag: "jugoso" },
          { key: "a-punto", name: "A punto", isDefault: true, tag: "a-punto" },
          { key: "bien-cocido", name: "Bien cocido", tag: "bien-cocido" },
        ],
      },
      {
        key: "guarnicion-q",
        name: "Guarnición",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          { key: "fritas", name: "Papas fritas", isDefault: true },
          { key: "ensalada", name: "Ensalada", delta: { kcalDelta: -220, carbsDeltaG: -28, fatDeltaG: -12, fiberDeltaG: 3 } },
          { key: "mandioca", name: "Mandioca hervida", delta: { kcalDelta: -60, carbsDeltaG: 5, fatDeltaG: -10 } },
        ],
      },
      {
        key: "extras-q",
        name: "Extras",
        required: false,
        minSelect: 0,
        maxSelect: 3,
        options: [
          {
            key: "panceta",
            name: "Panceta",
            priceDelta: 6_000,
            dailyStock: 10,
            delta: { kcalDelta: 140, proteinDeltaG: 8, fatDeltaG: 12, sodiumDeltaMg: 400 },
          },
          {
            key: "cheddar",
            name: "Queso cheddar",
            priceDelta: 4_000,
            delta: { kcalDelta: 110, proteinDeltaG: 7, fatDeltaG: 9, sodiumDeltaMg: 180 },
          },
          { key: "huevo", name: "Huevo frito", priceDelta: 3_000, delta: { kcalDelta: 90, proteinDeltaG: 6, fatDeltaG: 7 } },
        ],
      },
      {
        key: "quitar-q",
        name: "Quitar",
        required: false,
        minSelect: 0,
        maxSelect: 3,
        options: [
          { key: "sin-cebolla", name: "Sin cebolla", tag: "sin-cebolla" },
          { key: "sin-pickles", name: "Sin pickles" },
          { key: "sin-tomate", name: "Sin tomate", tag: "sin-tomate" },
        ],
      },
    ],
    dishes: [
      {
        key: "bife-chorizo",
        name: "Bife de chorizo 300 g",
        description: "Corte grueso a la parrilla con guarnición.",
        category: "Parrilla",
        basePrice: 65_000,
        macros: { servingGrams: 420, kcal: 780, proteinG: 62, carbsG: 30, fatG: 46, sodiumMg: 700 },
        groups: ["punto", "guarnicion-q", "extras-q"],
        weekdays: TUE_SUN,
        dailyStock: 15,
      },
      {
        key: "hamburguesa",
        name: "Hamburguesa El Quincho",
        description: "Medallón de 180 g, lechuga, tomate, cebolla y pickles. Con papas.",
        category: "Hamburguesas y lomitos",
        basePrice: 38_000,
        allowNotes: true,
        macros: { servingGrams: 380, kcal: 850, proteinG: 45, carbsG: 55, fatG: 48, sodiumMg: 1250 },
        groups: ["punto", "quitar-q", "extras-q"],
        weekdays: TUE_SUN,
        dailyStock: 30,
      },
      {
        key: "lomito",
        name: "Lomito árabe",
        description: "Pan árabe, carne, lechuga, tomate, huevo y salsa de la casa.",
        category: "Hamburguesas y lomitos",
        basePrice: 40_000,
        allowNotes: true,
        macros: null,
        groups: ["quitar-q", "extras-q"],
        weekdays: TUE_SUN,
        dailyStock: 25,
      },
      {
        key: "costilla",
        name: "Costilla de cerdo a la parrilla",
        description: "Costillar de cerdo con guarnición. Solo fines de semana.",
        category: "Parrilla",
        basePrice: 55_000,
        macros: null,
        groups: ["guarnicion-q"],
        weekdays: [5, 6, 7],
        dailyStock: 12,
      },
      {
        key: "chorizo",
        name: "Chorizo con mandioca",
        description: "Dos chorizos parrilleros con mandioca.",
        category: "Parrilla",
        basePrice: 25_000,
        macros: { servingGrams: 300, kcal: 620, proteinG: 24, carbsG: 35, fatG: 42, sodiumMg: 1400 },
        groups: [],
        weekdays: TUE_SUN,
        dailyStock: 20,
      },
    ],
    slots: [
      { weekdays: TUE_SUN, start: "12:00", end: "12:30", capacity: 12, scope: "PICKUP" },
      { weekdays: TUE_SUN, start: "12:30", end: "13:00", capacity: 12, scope: "PICKUP" },
      { weekdays: TUE_SUN, start: "20:00", end: "20:30", capacity: 10, scope: "PICKUP" },
      { weekdays: TUE_SUN, start: "20:30", end: "21:00", capacity: 10, scope: "PICKUP" },
      { weekdays: TUE_SUN, start: "21:00", end: "21:30", capacity: 10, scope: "PICKUP" },
    ],
  },
];

export type CustomerDef = {
  key: string;
  name: string;
  email: string;
  phone: string;
  zone: string;
  street: string;
  allergens: Allergen[];
  allergyOther?: string;
  generalPrefs: string[]; // slugs de PreferenceTag
  dishPrefs: { restaurant: string; dish: string; group: string; option: string }[];
};

export const CUSTOMERS: CustomerDef[] = [
  {
    key: "ana",
    name: "Ana Benítez",
    email: "ana@prepago.test",
    phone: "0981 111 222",
    zone: "centro",
    street: "Palma 520",
    allergens: [],
    generalPrefs: ["sin-cebolla"],
    dishPrefs: [{ restaurant: "rosa", dish: "milanesa", group: "punto-mila", option: "tostadita" }],
  },
  {
    key: "maria",
    name: "María Giménez",
    email: "maria@prepago.test",
    phone: "0982 333 444",
    zone: "villa-morra",
    street: "Senador Long 1200",
    allergens: ["LACTOSE"],
    generalPrefs: ["sin-tomate"],
    dishPrefs: [{ restaurant: "fit", dish: "bowl-pollo", group: "base", option: "quinoa" }],
  },
  {
    key: "juan",
    name: "Juan Ortiz",
    email: "juan@prepago.test",
    phone: "0983 555 666",
    zone: "recoleta",
    street: "Brasilia 940",
    allergens: ["PEANUT", "OTHER"],
    allergyOther: "Kiwi",
    generalPrefs: ["bien-cocido"],
    dishPrefs: [],
  },
  {
    key: "sofia",
    name: "Sofía Duarte",
    email: "sofia@prepago.test",
    phone: "0984 777 888",
    zone: "carmelitas",
    street: "Dr. Morra 330",
    allergens: ["GLUTEN"],
    generalPrefs: ["jugoso", "sin-cebolla"],
    dishPrefs: [],
  },
  ...[
    ["carlos", "Carlos Ramírez", "sajonia", [] as Allergen[]],
    ["lucia", "Lucía Fernández", "recoleta", ["EGG"] as Allergen[]],
    ["diego", "Diego Acosta", "centro", [] as Allergen[]],
    ["valeria", "Valeria Cáceres", "las-mercedes", ["SHELLFISH"] as Allergen[]],
    ["martin", "Martín Villalba", "villa-morra", [] as Allergen[]],
    ["camila", "Camila Rojas", "carmelitas", ["SOY"] as Allergen[]],
  ].map(([key, name, zone, allergens], i) => ({
    key: key as string,
    name: name as string,
    email: `${key}@prepago.test`,
    phone: `0985 ${String(100 + i * 37).padStart(3, "0")} ${String(200 + i * 53).padStart(3, "0")}`,
    zone: zone as string,
    street: `Calle ${i + 1} n.º ${100 + i * 11}`,
    allergens: allergens as Allergen[],
    generalPrefs: [],
    dishPrefs: [],
  })),
];

export const NOTES = ["Cortar en tiras, por favor", "Poca sal", "Salsa aparte", "Bien caliente", "Para llevar a la oficina"];
