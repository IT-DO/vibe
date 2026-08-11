import "server-only";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { LOCALES, INTL_LOCALE, localePath, type Locale } from "@/lib/i18n/config";
import { getSettings } from "@/lib/settings";

export const SITE_NAME = "PrintAu";

// Абсолютный адрес сайта нужен для canonical, hreflang, sitemap и Open Graph —
// относительные адреса там не работают. Берём из настроек площадки (админка →
// APP_URL), иначе восстанавливаем из заголовков запроса.
export async function getSiteUrl(): Promise<string> {
  const settings = await getSettings();
  if (settings.appUrl) return settings.appUrl.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Тексты для <title>/<description> по каждому языку. Держим отдельно от
// интерфейсных словарей: формулировки здесь пишутся под поисковый запрос
// ("3D printing service", "impresión 3D"), а не под кнопку в интерфейсе.
type PageSeo = { title: string; description: string };
type SeoKey = "home" | "auctions" | "executors" | "materials" | "offer" | "privacy";

export const SEO: Record<Locale, { keywords: string; pages: Record<SeoKey, PageSeo> }> = {
  ru: {
    keywords: "3D-печать на заказ, услуги 3D печати, 3D моделирование, FDM, SLA, SLS, печать металлом, биржа исполнителей",
    pages: {
      home: {
        title: "PrintAu — биржа 3D-печати: заказы, исполнители и 3D-дизайнеры",
        description: "Разместите заказ на 3D-печать бесплатно и получите предложения от проверенных исполнителей. Аукцион ставок, отзывы и рейтинги, FDM, SLA, SLS и печать металлом.",
      },
      auctions: {
        title: "Открытые заказы на 3D-печать — аукцион ставок | PrintAu",
        description: "Актуальные заказы на 3D-печать и 3D-моделирование. Сравните цены и сроки, сделайте ставку и получите работу.",
      },
      executors: {
        title: "Исполнители 3D-печати и 3D-дизайнеры — каталог | PrintAu",
        description: "Каталог проверенных исполнителей 3D-печати и дизайнеров с рейтингами и отзывами. Фильтры по материалу, городу, рейтингу и числу выполненных заказов.",
      },
      materials: {
        title: "Материалы и технологии 3D-печати: PLA, PETG, ABS, смола, металл | PrintAu",
        description: "Сравнительная таблица материалов 3D-печати: температура печати, термостойкость, ударная вязкость, плотность. Технологии FDM, SLA/DLP, SLS, DMLS/SLM и литьё.",
      },
      offer: { title: "Публичная оферта | PrintAu", description: "Условия использования площадки PrintAu: подписка, комиссия, оплата и возвраты." },
      privacy: { title: "Политика конфиденциальности | PrintAu", description: "Как PrintAu хранит и обрабатывает персональные данные и файлы, приложенные к заказам." },
    },
  },
  en: {
    keywords: "3D printing service, custom 3D printing, 3D modeling, FDM, SLA, SLS, metal printing, print on demand marketplace",
    pages: {
      home: {
        title: "PrintAu — 3D Printing Marketplace: Get Quotes from Verified Providers",
        description: "Post your 3D printing job for free and get competitive bids from verified providers. Reverse-auction pricing, reviews and ratings, FDM, SLA, SLS and metal printing.",
      },
      auctions: {
        title: "Open 3D Printing Jobs — Live Bidding | PrintAu",
        description: "Browse open 3D printing and 3D modeling jobs. Compare budgets and deadlines, place your bid and win the work.",
      },
      executors: {
        title: "3D Printing Services & 3D Designers — Directory | PrintAu",
        description: "Directory of verified 3D printing providers and designers with ratings and reviews. Filter by material, city, rating and completed orders.",
      },
      materials: {
        title: "3D Printing Materials & Technologies: PLA, PETG, ABS, Resin, Metal | PrintAu",
        description: "Compare 3D printing materials: printing temperature, heat resistance, impact toughness and density. FDM, SLA/DLP, SLS, DMLS/SLM and investment casting explained.",
      },
      offer: { title: "Terms of Service | PrintAu", description: "PrintAu marketplace terms: subscription, commission, payments and refunds." },
      privacy: { title: "Privacy Policy | PrintAu", description: "How PrintAu stores and processes personal data and files attached to orders." },
    },
  },
  zh: {
    keywords: "3D打印服务, 定制3D打印, 3D建模, FDM, SLA, SLS, 金属打印, 打印平台",
    pages: {
      home: {
        title: "PrintAu — 3D打印交易平台：从认证服务商获取报价",
        description: "免费发布3D打印需求，获取认证服务商的竞价。竞价拍卖、评价与评分，支持FDM、SLA、SLS及金属打印。",
      },
      auctions: {
        title: "公开的3D打印订单 — 实时竞价 | PrintAu",
        description: "浏览公开的3D打印与3D建模订单。比较预算与交期，出价并赢得订单。",
      },
      executors: {
        title: "3D打印服务商与3D设计师目录 | PrintAu",
        description: "认证3D打印服务商与设计师目录，含评分与评价。可按材料、城市、评分与完成订单数筛选。",
      },
      materials: {
        title: "3D打印材料与工艺：PLA、PETG、ABS、树脂、金属 | PrintAu",
        description: "3D打印材料对比表：打印温度、耐热性、冲击韧性与密度。详解FDM、SLA/DLP、SLS、DMLS/SLM与熔模铸造。",
      },
      offer: { title: "服务条款 | PrintAu", description: "PrintAu平台条款：订阅、佣金、支付与退款。" },
      privacy: { title: "隐私政策 | PrintAu", description: "PrintAu如何存储和处理个人数据及订单附件。" },
    },
  },
  hi: {
    keywords: "3D प्रिंटिंग सेवा, कस्टम 3D प्रिंटिंग, 3D मॉडलिंग, FDM, SLA, SLS, मेटल प्रिंटिंग",
    pages: {
      home: {
        title: "PrintAu — 3D प्रिंटिंग मार्केटप्लेस: सत्यापित प्रदाताओं से कोटेशन पाएं",
        description: "अपना 3D प्रिंटिंग ऑर्डर मुफ़्त में पोस्ट करें और सत्यापित प्रदाताओं से बोलियाँ पाएं। नीलामी मूल्य निर्धारण, समीक्षाएँ और रेटिंग, FDM, SLA, SLS और मेटल प्रिंटिंग।",
      },
      auctions: {
        title: "खुले 3D प्रिंटिंग ऑर्डर — लाइव बोली | PrintAu",
        description: "खुले 3D प्रिंटिंग और 3D मॉडलिंग ऑर्डर देखें। बजट और समयसीमा की तुलना करें, बोली लगाएं और काम जीतें।",
      },
      executors: {
        title: "3D प्रिंटिंग सेवाएँ और 3D डिज़ाइनर — निर्देशिका | PrintAu",
        description: "रेटिंग और समीक्षाओं के साथ सत्यापित 3D प्रिंटिंग प्रदाताओं और डिज़ाइनरों की निर्देशिका। सामग्री, शहर, रेटिंग के अनुसार फ़िल्टर करें।",
      },
      materials: {
        title: "3D प्रिंटिंग सामग्री और तकनीकें: PLA, PETG, ABS, रेज़िन, धातु | PrintAu",
        description: "3D प्रिंटिंग सामग्री की तुलना: प्रिंटिंग तापमान, ऊष्मा प्रतिरोध, प्रभाव क्रूरता और घनत्व। FDM, SLA/DLP, SLS, DMLS/SLM की व्याख्या।",
      },
      offer: { title: "सेवा की शर्तें | PrintAu", description: "PrintAu मार्केटप्लेस शर्तें: सदस्यता, कमीशन, भुगतान और रिफंड।" },
      privacy: { title: "गोपनीयता नीति | PrintAu", description: "PrintAu व्यक्तिगत डेटा और ऑर्डर से जुड़ी फ़ाइलों को कैसे संग्रहीत और संसाधित करता है।" },
    },
  },
  es: {
    keywords: "servicio de impresión 3D, impresión 3D personalizada, modelado 3D, FDM, SLA, SLS, impresión en metal",
    pages: {
      home: {
        title: "PrintAu — Marketplace de impresión 3D: presupuestos de proveedores verificados",
        description: "Publica tu pedido de impresión 3D gratis y recibe ofertas de proveedores verificados. Subasta de precios, reseñas y valoraciones, FDM, SLA, SLS e impresión en metal.",
      },
      auctions: {
        title: "Pedidos abiertos de impresión 3D — subasta en vivo | PrintAu",
        description: "Explora pedidos abiertos de impresión 3D y modelado 3D. Compara presupuestos y plazos, haz tu oferta y consigue el trabajo.",
      },
      executors: {
        title: "Servicios de impresión 3D y diseñadores 3D — directorio | PrintAu",
        description: "Directorio de proveedores de impresión 3D y diseñadores verificados con valoraciones y reseñas. Filtra por material, ciudad y pedidos completados.",
      },
      materials: {
        title: "Materiales y tecnologías de impresión 3D: PLA, PETG, ABS, resina, metal | PrintAu",
        description: "Tabla comparativa de materiales de impresión 3D: temperatura, resistencia térmica, resistencia al impacto y densidad. FDM, SLA/DLP, SLS, DMLS/SLM y fundición.",
      },
      offer: { title: "Términos del servicio | PrintAu", description: "Condiciones del marketplace PrintAu: suscripción, comisión, pagos y reembolsos." },
      privacy: { title: "Política de privacidad | PrintAu", description: "Cómo PrintAu almacena y procesa los datos personales y los archivos adjuntos a los pedidos." },
    },
  },
  fr: {
    keywords: "service impression 3D, impression 3D sur mesure, modélisation 3D, FDM, SLA, SLS, impression métal",
    pages: {
      home: {
        title: "PrintAu — Place de marché d'impression 3D : devis de prestataires vérifiés",
        description: "Publiez gratuitement votre projet d'impression 3D et recevez des offres de prestataires vérifiés. Enchères inversées, avis et notes, FDM, SLA, SLS et impression métal.",
      },
      auctions: {
        title: "Commandes d'impression 3D ouvertes — enchères en direct | PrintAu",
        description: "Parcourez les commandes ouvertes d'impression 3D et de modélisation 3D. Comparez budgets et délais, proposez votre offre et remportez le projet.",
      },
      executors: {
        title: "Services d'impression 3D et designers 3D — annuaire | PrintAu",
        description: "Annuaire de prestataires d'impression 3D et de designers vérifiés avec notes et avis. Filtrez par matériau, ville, note et commandes réalisées.",
      },
      materials: {
        title: "Matériaux et technologies d'impression 3D : PLA, PETG, ABS, résine, métal | PrintAu",
        description: "Tableau comparatif des matériaux d'impression 3D : température, résistance thermique, résilience et densité. FDM, SLA/DLP, SLS, DMLS/SLM et fonderie.",
      },
      offer: { title: "Conditions d'utilisation | PrintAu", description: "Conditions de la place de marché PrintAu : abonnement, commission, paiements et remboursements." },
      privacy: { title: "Politique de confidentialité | PrintAu", description: "Comment PrintAu stocke et traite les données personnelles et les fichiers joints aux commandes." },
    },
  },
  ar: {
    keywords: "خدمة الطباعة ثلاثية الأبعاد, طباعة ثلاثية الأبعاد حسب الطلب, نمذجة ثلاثية الأبعاد, FDM, SLA, SLS, طباعة معدنية",
    pages: {
      home: {
        title: "PrintAu — سوق الطباعة ثلاثية الأبعاد: عروض أسعار من مزودين موثوقين",
        description: "انشر طلب الطباعة ثلاثية الأبعاد مجاناً واحصل على عروض من مزودين موثوقين. مزاد للأسعار، تقييمات ومراجعات، FDM وSLA وSLS والطباعة المعدنية.",
      },
      auctions: {
        title: "طلبات طباعة ثلاثية الأبعاد مفتوحة — مزاد مباشر | PrintAu",
        description: "تصفح طلبات الطباعة والنمذجة ثلاثية الأبعاد المفتوحة. قارن الميزانيات والمواعيد، وقدّم عرضك واربح العمل.",
      },
      executors: {
        title: "خدمات الطباعة ثلاثية الأبعاد والمصممون — الدليل | PrintAu",
        description: "دليل مزودي الطباعة ثلاثية الأبعاد والمصممين الموثوقين مع التقييمات والمراجعات. تصفية حسب المادة والمدينة والتقييم.",
      },
      materials: {
        title: "مواد وتقنيات الطباعة ثلاثية الأبعاد: PLA وPETG وABS والراتنج والمعدن | PrintAu",
        description: "جدول مقارنة مواد الطباعة ثلاثية الأبعاد: درجة حرارة الطباعة، المقاومة الحرارية، متانة الصدم والكثافة. شرح FDM وSLA/DLP وSLS وDMLS/SLM.",
      },
      offer: { title: "شروط الخدمة | PrintAu", description: "شروط منصة PrintAu: الاشتراك والعمولة والمدفوعات والاستردادات." },
      privacy: { title: "سياسة الخصوصية | PrintAu", description: "كيف تخزن PrintAu البيانات الشخصية والملفات المرفقة بالطلبات وتعالجها." },
    },
  },
};

// hreflang-альтернативы: каждая страница объявляет свои версии на всех языках
// плюс x-default. Именно это позволяет поисковику показать французу
// французскую версию, а не ту, что он проиндексировал первой.
function alternateLanguages(siteUrl: string, path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) {
    languages[INTL_LOCALE[locale]] = `${siteUrl}${localePath(path, locale)}`;
  }
  languages["x-default"] = `${siteUrl}${localePath(path, "en")}`;
  return languages;
}

// Единая сборка метаданных страницы: canonical на собственный языковой адрес,
// hreflang на все остальные, Open Graph и Twitter-карточка для соцсетей.
export async function buildMetadata(params: {
  locale: Locale;
  path: string;
  title: string;
  description: string;
  keywords?: string;
  noindex?: boolean;
}): Promise<Metadata> {
  const siteUrl = await getSiteUrl();
  const canonical = `${siteUrl}${localePath(params.path, params.locale)}`;

  return {
    metadataBase: new URL(siteUrl),
    title: params.title,
    description: params.description,
    keywords: params.keywords,
    alternates: { canonical, languages: alternateLanguages(siteUrl, params.path) },
    robots: params.noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: params.title,
      description: params.description,
      url: canonical,
      locale: INTL_LOCALE[params.locale].replace("-", "_"),
    },
    twitter: { card: "summary_large_image", title: params.title, description: params.description },
  };
}

// Метаданные для типовой статической страницы из таблицы SEO выше.
export async function pageMetadata(locale: Locale, key: SeoKey, path: string): Promise<Metadata> {
  const { pages, keywords } = SEO[locale];
  return buildMetadata({ locale, path, ...pages[key], keywords });
}
