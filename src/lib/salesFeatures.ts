/**
 * Sales Features Database - Multi-language feature descriptions for salespeople
 * Organized by category with sales-focused benefits and use cases
 */

export type Feature = {
  id: string;
  icon: string;
  titleKey: string;
  descriptionKey: string;
  benefitsKey: string[];
  useCasesKey: string[];
  category: "collaboration" | "ai" | "security" | "productivity" | "media";
};

export type FeatureCategory = {
  categoryKey: string;
  descriptionKey: string;
  features: Feature[];
};

export type SalesContent = {
  language: string;
  platformName: string;
  tagline: string;
  categories: FeatureCategory[];
  translations: Record<string, string>;
};

const translations: Record<string, Record<string, string>> = {
  en: {
    // Platform
    "platform.name": "OfficeConnect",
    "platform.tagline": "Enterprise-grade video meetings with AI-powered productivity",

    // Categories
    "category.collaboration": "Real-time Collaboration",
    "category.collaboration.desc": "Tools that bring teams together instantly",
    "category.ai": "AI & Automation",
    "category.ai.desc": "Smart features that save time and reduce manual work",
    "category.security": "Security & Compliance",
    "category.security.desc": "Enterprise controls and audit capabilities",
    "category.productivity": "Meeting Analytics",
    "category.productivity.desc": "Data-driven insights for better meetings",
    "category.media": "Media & Streaming",
    "category.media.desc": "Professional audio and video capabilities",

    // Collaboration Features
    "feature.hd_video.title": "HD Video Meetings",
    "feature.hd_video.desc": "Crystal-clear video with optimized media paths and low-latency connections. Zero setup required—join instantly from any browser.",
    "feature.hd_video.benefit1": "Reduce no-shows with fast, reliable joins",
    "feature.hd_video.benefit2": "Works across all devices and networks",
    "feature.hd_video.benefit3": "Adaptive quality based on bandwidth",
    "feature.hd_video.usecase1": "Daily team standups and planning sessions",
    "feature.hd_video.usecase2": "Client presentations and sales demos",

    "feature.screen_sharing.title": "Screen & Content Sharing",
    "feature.screen_sharing.desc": "Share your entire screen, specific windows, or browser tabs. Perfect for demos, walkthroughs, and collaborative editing.",
    "feature.screen_sharing.benefit1": "Accelerate decision-making with live visuals",
    "feature.screen_sharing.benefit2": "Reduce misunderstandings vs. text-only communication",
    "feature.screen_sharing.benefit3": "Support remote onboarding and training",
    "feature.screen_sharing.usecase1": "Product demos and feature walkthroughs",
    "feature.screen_sharing.usecase2": "Code reviews and pair programming",

    "feature.breakout_rooms.title": "Breakout Rooms",
    "feature.breakout_rooms.desc": "Split large meetings into focused sub-groups, then bring everyone back together. Ideal for workshops, training, and brainstorming.",
    "feature.breakout_rooms.benefit1": "Enable parallel discussions in large meetings",
    "feature.breakout_rooms.benefit2": "Increase engagement for 50+ person calls",
    "feature.breakout_rooms.benefit3": "Perfect for facilitated workshops and training",
    "feature.breakout_rooms.usecase1": "All-hands meetings with department breakouts",
    "feature.breakout_rooms.usecase2": "Training sessions with group exercises",

    "feature.whiteboard.title": "Collaborative Whiteboard",
    "feature.whiteboard.desc": "Real-time infinite whiteboard for sketching, diagramming, and brainstorming. Everyone draws and edits simultaneously.",
    "feature.whiteboard.benefit1": "Convert whiteboarding sessions into records",
    "feature.whiteboard.benefit2": "Perfect for design and architecture discussions",
    "feature.whiteboard.benefit3": "No need to switch apps or tools",
    "feature.whiteboard.usecase1": "Design thinking and UX workshops",
    "feature.whiteboard.usecase2": "Architecture and planning sessions",

    "feature.reactions.title": "Reactions & Engagement",
    "feature.reactions.desc": "Clap, heart, laugh, or thumbs-up without unmuting. Keep meetings flowing while showing engagement.",
    "feature.reactions.benefit1": "Maintain meeting momentum without interruptions",
    "feature.reactions.benefit2": "Gauge audience sentiment without asking",
    "feature.reactions.benefit3": "More engaging than chat-only feedback",
    "feature.reactions.usecase1": "Webinars and large presentations",
    "feature.reactions.usecase2": "Real-time polling and feedback",

    "feature.file_sharing.title": "Secure File Sharing",
    "feature.file_sharing.desc": "Share documents, images, and files directly in the meeting. Automatic malware scanning and access controls included.",
    "feature.file_sharing.benefit1": "Keep files organized within meeting context",
    "feature.file_sharing.benefit2": "No external tool switching required",
    "feature.file_sharing.benefit3": "Enterprise-grade security scanning",
    "feature.file_sharing.usecase1": "Client presentations with NDAs and security",
    "feature.file_sharing.usecase2": "Document review sessions",

    // AI Features
    "feature.live_transcript.title": "Live Real-time Transcription",
    "feature.live_transcript.desc": "AI-powered transcription as people speak. Searchable, quotable, and automatically attributed to speakers.",
    "feature.live_transcript.benefit1": "Help hearing-impaired attendees participate fully",
    "feature.live_transcript.benefit2": "Create searchable meeting records instantly",
    "feature.live_transcript.benefit3": "Support multiple languages simultaneously",
    "feature.live_transcript.usecase1": "Compliance and regulatory meeting records",
    "feature.live_transcript.usecase2": "Global teams with non-native speakers",

    "feature.voice_translation.title": "Real-time Voice Translation",
    "feature.voice_translation.desc": "Hear other speakers in your language. English speaker? Hear them in perfect Odia. Breaks down language barriers in real-time.",
    "feature.voice_translation.benefit1": "Expand to global teams and markets",
    "feature.voice_translation.benefit2": "Remove language as a barrier to participation",
    "feature.voice_translation.benefit3": "Increase comfort for non-native speakers",
    "feature.voice_translation.usecase1": "Global companies with multi-language teams",
    "feature.voice_translation.usecase2": "International client meetings and training",

    "feature.meeting_summary.title": "AI Meeting Summaries",
    "feature.meeting_summary.desc": "Automatic summaries with key points, decisions, and action items. Generated within minutes of meeting end.",
    "feature.meeting_summary.benefit1": "Reduce post-meeting note-taking by 80%",
    "feature.meeting_summary.benefit2": "Ensure nothing falls through cracks",
    "feature.meeting_summary.benefit3": "Help people who missed the meeting catch up",
    "feature.meeting_summary.usecase1": "Executive debriefs and status reports",
    "feature.meeting_summary.usecase2": "Client project kickoffs and updates",

    "feature.action_items.title": "Automatic Action Item Extraction",
    "feature.action_items.desc": "AI extracts tasks, owners, and due dates from meeting discussions. Sync to your task management system.",
    "feature.action_items.benefit1": "Eliminate manual action item logging",
    "feature.action_items.benefit2": "Owners get assigned automatically (with confirmation)",
    "feature.action_items.benefit3": "Integration-ready for Jira, Asana, etc.",
    "feature.action_items.usecase1": "Scrum standups and sprint planning",
    "feature.action_items.usecase2": "Project kickoffs and status reviews",

    "feature.smart_highlights.title": "Smart Highlights & Insights",
    "feature.smart_highlights.desc": "AI finds and tags key moments: decisions, blockers, risks, and important questions. Searchable by topic.",
    "feature.smart_highlights.benefit1": "Skip to relevant parts of long recordings",
    "feature.smart_highlights.benefit2": "Build searchable meeting knowledge base",
    "feature.smart_highlights.benefit3": "Identify patterns across meetings",
    "feature.smart_highlights.usecase1": "Customer support and training (reuse clips)",
    "feature.smart_highlights.usecase2": "Compliance and risk monitoring",

    // Security Features
    "feature.workspace_rbac.title": "Workspace Role-Based Access Control",
    "feature.workspace_rbac.desc": "Owner, admin, and member roles with granular permissions. Control who can create meetings, view recordings, and manage users.",
    "feature.workspace_rbac.benefit1": "Enterprise security and governance",
    "feature.workspace_rbac.benefit2": "Separate concerns (admins, hosts, guests)",
    "feature.workspace_rbac.benefit3": "Audit trails for compliance",
    "feature.workspace_rbac.usecase1": "Large enterprises with complex org structures",
    "feature.workspace_rbac.usecase2": "Regulated industries (finance, healthcare)",

    "feature.audit_logs.title": "Comprehensive Audit Logs",
    "feature.audit_logs.desc": "Track every action: who joined, who shared what, who downloaded recordings. Export for audits.",
    "feature.audit_logs.benefit1": "Meet regulatory compliance requirements",
    "feature.audit_logs.benefit2": "Investigate security incidents quickly",
    "feature.audit_logs.benefit3": "SLA-ready for customer audits",
    "feature.audit_logs.usecase1": "SOC 2 Type II compliance",
    "feature.audit_logs.usecase2": "Financial and legal investigations",

    "feature.recording_watermark.title": "Recording Watermarks",
    "feature.recording_watermark.desc": "Automatically watermark recordings with org branding and confidentiality notices. Deter unauthorized sharing.",
    "feature.recording_watermark.benefit1": "Protect sensitive content",
    "feature.recording_watermark.benefit2": "Enforce IP and compliance policies",
    "feature.recording_watermark.benefit3": "Visible enforcement without blocking",
    "feature.recording_watermark.usecase1": "Legal and financial institutions",
    "feature.recording_watermark.usecase2": "Confidential client service meetings",

    "feature.meeting_lock.title": "Meeting Lock & Security Controls",
    "feature.meeting_lock.desc": "Host can lock meetings to prevent late joins, remove disruptive participants, and manage waiting room.",
    "feature.meeting_lock.benefit1": "Control meeting access in real-time",
    "feature.meeting_lock.benefit2": "Protect sensitive information sharing",
    "feature.meeting_lock.benefit3": "Handle disruptions instantly",
    "feature.meeting_lock.usecase1": "Executive briefings and strategy sessions",
    "feature.meeting_lock.usecase2": "High-security client negotiations",

    // Productivity Features
    "feature.meeting_analytics.title": "Meeting Analytics Dashboard",
    "feature.meeting_analytics.desc": "See who spoke, for how long, and engagement metrics. Identify patterns and improve team dynamics.",
    "feature.meeting_analytics.benefit1": "Data-driven team insights",
    "feature.meeting_analytics.benefit2": "Optimize meeting cadence and format",
    "feature.meeting_analytics.benefit3": "Track productivity improvements over time",
    "feature.meeting_analytics.usecase1": "Team leads understanding participation gaps",
    "feature.meeting_analytics.usecase2": "HR and L&D teams monitoring employee engagement",

    "feature.meeting_search.title": "Meeting Search & Discovery",
    "feature.meeting_search.desc": "Full-text search across transcripts, summaries, and action items. Find any meeting in seconds.",
    "feature.meeting_search.benefit1": "Build institutional knowledge base",
    "feature.meeting_search.benefit2": "Find precedents and past decisions",
    "feature.meeting_search.benefit3": "Reduce duplicate meetings and discussions",
    "feature.meeting_search.usecase1": "Onboarding new team members",
    "feature.meeting_search.usecase2": "Legal discovery and compliance",

    "feature.avatar_mode.title": "AI Avatar Speaker Mode",
    "feature.avatar_mode.desc": "AI-generated avatar replays meeting summaries. Perfect for asynchronous updates and training content.",
    "feature.avatar_mode.benefit1": "Engage remote teams with video summaries",
    "feature.avatar_mode.benefit2": "Create reusable training content",
    "feature.avatar_mode.benefit3": "Humanize async communication",
    "feature.avatar_mode.usecase1": "Distributed teams in different time zones",
    "feature.avatar_mode.usecase2": "Product announcements and training",

    // Media Features
    "feature.recording.title": "Cloud Recording",
    "feature.recording.desc": "Automatic recording to cloud storage. Secure, searchable, and available for compliance or training.",
    "feature.recording.benefit1": "Never miss important information",
    "feature.recording.benefit2": "Reduce note-taking burden",
    "feature.recording.benefit3": "Reference for future disputes or decisions",
    "feature.recording.usecase1": "Employee training and onboarding",
    "feature.recording.usecase2": "Client service documentation",

    "feature.noise_suppression.title": "AI Noise Suppression",
    "feature.noise_suppression.desc": "Remove background noise, keyboard clicks, and distractions. Crystal-clear audio even in busy environments.",
    "feature.noise_suppression.benefit1": "Remote workers feel professional and heard",
    "feature.noise_suppression.benefit2": "Higher audio quality = better transcription",
    "feature.noise_suppression.benefit3": "Works offline and on-device",
    "feature.noise_suppression.usecase1": "Home office workers",
    "feature.noise_suppression.usecase2": "Improves overall meeting quality",

    "feature.background_blur.title": "Background Blur & Replacement",
    "feature.background_blur.desc": "Blur or replace your background. Professional appearance without special studio setup.",
    "feature.background_blur.benefit1": "Enable remote-first work culture",
    "feature.background_blur.benefit2": "Privacy and professionalism for home workers",
    "feature.background_blur.benefit3": "Works on any device",
    "feature.background_blur.usecase1": "Customer-facing roles (support, sales)",
    "feature.background_blur.usecase2": "Executive presentations",

    "feature.hand_raise.title": "Hand Raise & Queue Management",
    "feature.hand_raise.desc": "Participants raise their hand to speak. Host sees queue and calls on speakers in order.",
    "feature.hand_raise.benefit1": "Organize large meeting discussions",
    "feature.hand_raise.benefit2": "Ensure all voices are heard fairly",
    "feature.hand_raise.benefit3": "Perfect for Q&A sessions",
    "feature.hand_raise.usecase1": "All-hands meetings and town halls",
    "feature.hand_raise.usecase2": "Webinars and large presentations",

    "feature.low_bandwidth.title": "Low Bandwidth Mode",
    "feature.low_bandwidth.desc": "Graceful degradation for slow networks. Audio-first, reduced video resolution, but meeting stays alive.",
    "feature.low_bandwidth.benefit1": "Support international and remote workers",
    "feature.low_bandwidth.benefit2": "Meetings don't drop on poor connections",
    "feature.low_bandwidth.benefit3": "Reduce data usage and costs",
    "feature.low_bandwidth.usecase1": "Emerging markets and rural areas",
    "feature.low_bandwidth.usecase2": "Mobile and field worker support",

    // Use case translations
    "usecase.global_team": "Global team collaboration across time zones and languages",
    "usecase.security": "Regulated industries requiring strict security and audit trails",
    "usecase.hybrid_work": "Hybrid and remote teams needing flexible work tools",
    "usecase.client_service": "Client-facing teams requiring professional and secure meetings",

    // CTAs
    "cta.learn_more": "Learn More",
    "cta.schedule_demo": "Schedule a Demo",
    "cta.start_free": "Start Free Trial",
    "cta.contact_sales": "Contact Sales",
  },

  es: {
    // Platform
    "platform.name": "OfficeConnect",
    "platform.tagline": "Reuniones de video de calidad empresarial con productividad impulsada por IA",

    // Categories
    "category.collaboration": "Colaboración en Tiempo Real",
    "category.collaboration.desc": "Herramientas que unen a los equipos al instante",
    "category.ai": "IA y Automatización",
    "category.ai.desc": "Características inteligentes que ahorran tiempo y reducen el trabajo manual",
    "category.security": "Seguridad y Cumplimiento",
    "category.security.desc": "Controles empresariales y capacidades de auditoría",
    "category.productivity": "Análisis de Reuniones",
    "category.productivity.desc": "Información basada en datos para mejores reuniones",
    "category.media": "Medios y Transmisión",
    "category.media.desc": "Capacidades profesionales de audio y video",

    // Collaboration Features (Spanish)
    "feature.hd_video.title": "Reuniones de Video HD",
    "feature.hd_video.desc": "Video cristalino con rutas de medios optimizadas y conexiones de baja latencia. Sin configuración requerida—únete al instante desde cualquier navegador.",
    "feature.hd_video.benefit1": "Reduce las ausencias con uniones rápidas y confiables",
    "feature.hd_video.benefit2": "Compatible con todos los dispositivos y redes",
    "feature.hd_video.benefit3": "Calidad adaptativa según el ancho de banda",

    "feature.screen_sharing.title": "Intercambio de Pantalla y Contenido",
    "feature.screen_sharing.desc": "Comparte tu pantalla completa, ventanas específicas o pestañas del navegador. Perfecto para demostraciones y edición colaborativa.",
    "feature.screen_sharing.benefit1": "Acelera la toma de decisiones con visuales en tiempo real",
    "feature.screen_sharing.benefit2": "Reduce malentendidos frente a comunicación solo por texto",
    "feature.screen_sharing.benefit3": "Apoya capacitación y incorporación remota",

    // ... (continuing with Spanish translations for all features)
    "feature.live_transcript.title": "Transcripción en Tiempo Real",
    "feature.live_transcript.desc": "Transcripción impulsada por IA mientras las personas hablan. Buscable, citable y atribuida automáticamente a oradores.",
    "feature.live_transcript.benefit1": "Ayuda a participantes con discapacidad auditiva",
    "feature.live_transcript.benefit2": "Crea registros de reuniones buscables al instante",
    "feature.live_transcript.benefit3": "Apoya múltiples idiomas simultáneamente",

    "feature.voice_translation.title": "Traducción de Voz en Tiempo Real",
    "feature.voice_translation.desc": "Escucha a otros oradores en tu idioma. ¿Hablante de inglés? Escúchalos en perfecto español.",
    "feature.voice_translation.benefit1": "Expande a equipos y mercados globales",
    "feature.voice_translation.benefit2": "Elimina el idioma como barrera de participación",
    "feature.voice_translation.benefit3": "Aumenta la comodidad para hablantes no nativos",

    "feature.meeting_summary.title": "Resúmenes Automáticos de Reuniones",
    "feature.meeting_summary.desc": "Resúmenes automáticos con puntos clave, decisiones y elementos de acción.",
    "feature.meeting_summary.benefit1": "Reduce la toma de notas en un 80%",
    "feature.meeting_summary.benefit2": "Asegura que nada se pierda",
    "feature.meeting_summary.benefit3": "Ayuda a quienes se perdieron a ponerse al día",

    "cta.learn_more": "Más Información",
    "cta.schedule_demo": "Programar Demostración",
    "cta.start_free": "Comenzar Prueba Gratuita",
    "cta.contact_sales": "Contactar Ventas",
  },

  hi: {
    // Platform
    "platform.name": "OfficeConnect",
    "platform.tagline": "AI-संचालित उत्पादकता के साथ एंटरप्राइज-ग्रेड वीडियो बैठकें",

    // Categories
    "category.collaboration": "रीयल-टाइम सहयोग",
    "category.collaboration.desc": "उपकरण जो टीमों को तुरंत एक साथ लाते हैं",
    "category.ai": "AI और स्वचालन",
    "category.ai.desc": "स्मार्ट सुविधाएँ जो समय बचाती हैं और मैनुअल काम को कम करती हैं",
    "category.security": "सुरक्षा और अनुपालन",
    "category.security.desc": "एंटरप्राइज नियंत्रण और ऑडिट क्षमताएँ",
    "category.productivity": "बैठक विश्लेषण",
    "category.productivity.desc": "बेहतर बैठकों के लिए डेटा-संचालित अंतर्दृष्टि",
    "category.media": "मीडिया और स्ट्रीमिंग",
    "category.media.desc": "पेशेवर ऑडियो और वीडियो क्षमताएँ",

    // Features in Hindi
    "feature.hd_video.title": "HD वीडियो बैठकें",
    "feature.hd_video.desc": "क्रिस्टल-स्पष्ट वीडियो अनुकूलित मीडिया पथ और कम-विलंबता कनेक्शन के साथ।",
    "feature.hd_video.benefit1": "तेज़, विश्वसनीय जुड़ाव के साथ नो-शो कम करें",
    "feature.hd_video.benefit2": "सभी डिवाइस और नेटवर्क पर काम करता है",
    "feature.hd_video.benefit3": "बैंडविड्थ के आधार पर अनुकूल गुणवत्ता",

    "feature.voice_translation.title": "रीयल-टाइम वॉयस अनुवाद",
    "feature.voice_translation.desc": "अपनी भाषा में अन्य वक्ताओं को सुनें। अंग्रेजी बोलने वाले? उन्हें हिंदी में सुनें।",
    "feature.voice_translation.benefit1": "वैश्विक टीमों और बाजारों तक विस्तार करें",
    "feature.voice_translation.benefit2": "भाषा को भागीदारी के बाधा के रूप में हटाएं",
    "feature.voice_translation.benefit3": "गैर-मूल वक्ताओं के लिए आराम बढ़ाएं",

    "cta.learn_more": "और जानें",
    "cta.schedule_demo": "डेमो शेड्यूल करें",
    "cta.start_free": "मुफ्त ट्रायल शुरू करें",
    "cta.contact_sales": "बिक्रय से संपर्क करें",
  },

  or: {
    // Platform
    "platform.name": "OfficeConnect",
    "platform.tagline": "AI-ଚାଳିତ ଉତ୍ପାଦନଶୀଳତା ସହ ଏଣ୍ଟରପ୍ରାଇଜ-ଗ୍ରେଡ ଭିଡିଓ ମିଟିଂଗ",

    // Categories
    "category.collaboration": "ରିଅଲ-ଟାଇମ ସହଯୋଗ",
    "category.collaboration.desc": "ଟୁଲସ୍ ଯାହା ତା଎କ୍ଷଣିକ ଭାବରେ ଦଳକୁ ଏକତ୍ରିତ କରେ",
    "category.ai": "AI ଏବଂ ସ୍ୱୟଂକ୍ରିୟତା",
    "category.ai.desc": "ସ୍ମାର୍ଟ ବୈଶିଷ୍ଟ୍ୟ ଯାହା ସମୟ ସଞ୍ଚୟ କରେ ଏବଂ ମାନୁଆଲ କାର୍ଯ୍ୟ ହ୍ରାସ କରେ",
    "category.security": "ସୁରକ୍ଷା ଏବଂ ସମ୍ମତି",
    "category.security.desc": "ଏଣ୍ଟରପ୍ରାଇଜ ନିୟନ୍ତ୍ରଣ ଏବଂ ଅଡିଟ ଦକ୍ଷତା",
    "category.productivity": "ମିଟିଂଗ ବିଶ୍ଳେଷଣ",
    "category.productivity.desc": "ଭଲ ମିଟିଂଗ ପାଇଁ ଡେଟା-ଚାଳିତ ଅନ୍ତର୍ଦୃଷ୍ଟି",
    "category.media": "ମିଡିଆ ଏବଂ ଷ୍ଟ୍ରିମିଂ",
    "category.media.desc": "ପେଶାଦାର ଅଡିଓ ଏବଂ ଭିଡିଓ ଦକ୍ଷତା",

    // Features in Odia
    "feature.hd_video.title": "HD ଭିଡିଓ ମିଟିଂଗ",
    "feature.hd_video.desc": "ଉତ୍ତମ-ସ୍ପଷ୍ଟ ଭିଡିଓ ଅପ୍ଟିମାଇଜଡ୍ ମିଡିଆ ପାଥ ଏବଂ କମ-ବିଳମ୍ବ ସଂଯୋଗ ସହିତ।",
    "feature.hd_video.benefit1": "ଦ୍ରୁତ, ନିର୍ভରଯୋଗ୍ୟ ଯୋଗଦାନ ସହିତ ନୋ-ଶୋ ହ୍ରାସ କରନ୍ତୁ",
    "feature.hd_video.benefit2": "ସମସ୍ତ ଡିଭାଇସ ଏବଂ ନେଟୱାର୍କରେ କାମ କରେ",
    "feature.hd_video.benefit3": "ବ୍ୟାଣ୍ଡୱିଡଥ ଉপରେ ଆଧାର କରି ଅଭିଯୋଜନଶୀଳ ଗୁଣବତ୍ତା",

    "feature.voice_translation.title": "ରିଅଲ-ଟାଇମ ଭଏସ୍ ଟ୍ରାନ୍ସଲେସନ",
    "feature.voice_translation.desc": "ତୁମର ଭାଷାରେ ଅନ୍ୟ ବକ୍ତାଙ୍କୁ ଶୁନ। ଇଂରାଜୀ ବକ୍ତା? ଓଡିଆରେ ଶୁନନ୍ତୁ।",
    "feature.voice_translation.benefit1": "ବିଶ୍ବର ଦଳ ଏବଂ ବଜାରକୁ ବିସ୍ତୃତ କରନ୍ତୁ",
    "feature.voice_translation.benefit2": "ଭାଷାକୁ ାଗଦାନର ବାଧା ଭାବରେ ହଟାନ୍ତୁ",
    "feature.voice_translation.benefit3": "ଅଣ-ନିଜ ବକ୍ତାଙ୍କ ପାଇଁ ଆରାମ ବୃଦ୍ଧି କରନ୍ତୁ",

    "cta.learn_more": "ଅଧିକ ଜାଣନ୍ତୁ",
    "cta.schedule_demo": "ଡେମୋ ନିର୍ଧାରଣ କରନ୍ତୁ",
    "cta.start_free": "ମୁକ୍ତ ପରୀକ୍ଷା ଆରମ୍ଭ କରନ୍ତୁ",
    "cta.contact_sales": "ବିକ୍ରୟ ସହିତ ଯୋଗାଯୋଗ କରନ୍ତୁ",
  },
};

export const salesFeaturesDatabase: FeatureCategory[] = [
  {
    categoryKey: "category.collaboration",
    descriptionKey: "category.collaboration.desc",
    features: [
      {
        id: "hd_video",
        icon: "📹",
        titleKey: "feature.hd_video.title",
        descriptionKey: "feature.hd_video.desc",
        benefitsKey: [
          "feature.hd_video.benefit1",
          "feature.hd_video.benefit2",
          "feature.hd_video.benefit3",
        ],
        useCasesKey: ["feature.hd_video.usecase1", "feature.hd_video.usecase2"],
        category: "collaboration",
      },
      {
        id: "screen_sharing",
        icon: "🖥️",
        titleKey: "feature.screen_sharing.title",
        descriptionKey: "feature.screen_sharing.desc",
        benefitsKey: [
          "feature.screen_sharing.benefit1",
          "feature.screen_sharing.benefit2",
          "feature.screen_sharing.benefit3",
        ],
        useCasesKey: ["feature.screen_sharing.usecase1", "feature.screen_sharing.usecase2"],
        category: "collaboration",
      },
      {
        id: "breakout_rooms",
        icon: "🚪",
        titleKey: "feature.breakout_rooms.title",
        descriptionKey: "feature.breakout_rooms.desc",
        benefitsKey: [
          "feature.breakout_rooms.benefit1",
          "feature.breakout_rooms.benefit2",
          "feature.breakout_rooms.benefit3",
        ],
        useCasesKey: ["feature.breakout_rooms.usecase1", "feature.breakout_rooms.usecase2"],
        category: "collaboration",
      },
      {
        id: "whiteboard",
        icon: "✏️",
        titleKey: "feature.whiteboard.title",
        descriptionKey: "feature.whiteboard.desc",
        benefitsKey: [
          "feature.whiteboard.benefit1",
          "feature.whiteboard.benefit2",
          "feature.whiteboard.benefit3",
        ],
        useCasesKey: ["feature.whiteboard.usecase1", "feature.whiteboard.usecase2"],
        category: "collaboration",
      },
      {
        id: "reactions",
        icon: "👍",
        titleKey: "feature.reactions.title",
        descriptionKey: "feature.reactions.desc",
        benefitsKey: [
          "feature.reactions.benefit1",
          "feature.reactions.benefit2",
          "feature.reactions.benefit3",
        ],
        useCasesKey: ["feature.reactions.usecase1", "feature.reactions.usecase2"],
        category: "collaboration",
      },
      {
        id: "file_sharing",
        icon: "📎",
        titleKey: "feature.file_sharing.title",
        descriptionKey: "feature.file_sharing.desc",
        benefitsKey: [
          "feature.file_sharing.benefit1",
          "feature.file_sharing.benefit2",
          "feature.file_sharing.benefit3",
        ],
        useCasesKey: ["feature.file_sharing.usecase1", "feature.file_sharing.usecase2"],
        category: "collaboration",
      },
    ],
  },
  {
    categoryKey: "category.ai",
    descriptionKey: "category.ai.desc",
    features: [
      {
        id: "live_transcript",
        icon: "📝",
        titleKey: "feature.live_transcript.title",
        descriptionKey: "feature.live_transcript.desc",
        benefitsKey: [
          "feature.live_transcript.benefit1",
          "feature.live_transcript.benefit2",
          "feature.live_transcript.benefit3",
        ],
        useCasesKey: ["feature.live_transcript.usecase1", "feature.live_transcript.usecase2"],
        category: "ai",
      },
      {
        id: "voice_translation",
        icon: "🌐",
        titleKey: "feature.voice_translation.title",
        descriptionKey: "feature.voice_translation.desc",
        benefitsKey: [
          "feature.voice_translation.benefit1",
          "feature.voice_translation.benefit2",
          "feature.voice_translation.benefit3",
        ],
        useCasesKey: ["feature.voice_translation.usecase1", "feature.voice_translation.usecase2"],
        category: "ai",
      },
      {
        id: "meeting_summary",
        icon: "📋",
        titleKey: "feature.meeting_summary.title",
        descriptionKey: "feature.meeting_summary.desc",
        benefitsKey: [
          "feature.meeting_summary.benefit1",
          "feature.meeting_summary.benefit2",
          "feature.meeting_summary.benefit3",
        ],
        useCasesKey: ["feature.meeting_summary.usecase1", "feature.meeting_summary.usecase2"],
        category: "ai",
      },
      {
        id: "action_items",
        icon: "✅",
        titleKey: "feature.action_items.title",
        descriptionKey: "feature.action_items.desc",
        benefitsKey: [
          "feature.action_items.benefit1",
          "feature.action_items.benefit2",
          "feature.action_items.benefit3",
        ],
        useCasesKey: ["feature.action_items.usecase1", "feature.action_items.usecase2"],
        category: "ai",
      },
      {
        id: "smart_highlights",
        icon: "⭐",
        titleKey: "feature.smart_highlights.title",
        descriptionKey: "feature.smart_highlights.desc",
        benefitsKey: [
          "feature.smart_highlights.benefit1",
          "feature.smart_highlights.benefit2",
          "feature.smart_highlights.benefit3",
        ],
        useCasesKey: ["feature.smart_highlights.usecase1", "feature.smart_highlights.usecase2"],
        category: "ai",
      },
    ],
  },
  {
    categoryKey: "category.security",
    descriptionKey: "category.security.desc",
    features: [
      {
        id: "workspace_rbac",
        icon: "🔐",
        titleKey: "feature.workspace_rbac.title",
        descriptionKey: "feature.workspace_rbac.desc",
        benefitsKey: [
          "feature.workspace_rbac.benefit1",
          "feature.workspace_rbac.benefit2",
          "feature.workspace_rbac.benefit3",
        ],
        useCasesKey: ["feature.workspace_rbac.usecase1", "feature.workspace_rbac.usecase2"],
        category: "security",
      },
      {
        id: "audit_logs",
        icon: "📊",
        titleKey: "feature.audit_logs.title",
        descriptionKey: "feature.audit_logs.desc",
        benefitsKey: [
          "feature.audit_logs.benefit1",
          "feature.audit_logs.benefit2",
          "feature.audit_logs.benefit3",
        ],
        useCasesKey: ["feature.audit_logs.usecase1", "feature.audit_logs.usecase2"],
        category: "security",
      },
      {
        id: "recording_watermark",
        icon: "🎬",
        titleKey: "feature.recording_watermark.title",
        descriptionKey: "feature.recording_watermark.desc",
        benefitsKey: [
          "feature.recording_watermark.benefit1",
          "feature.recording_watermark.benefit2",
          "feature.recording_watermark.benefit3",
        ],
        useCasesKey: ["feature.recording_watermark.usecase1", "feature.recording_watermark.usecase2"],
        category: "security",
      },
      {
        id: "meeting_lock",
        icon: "🔒",
        titleKey: "feature.meeting_lock.title",
        descriptionKey: "feature.meeting_lock.desc",
        benefitsKey: [
          "feature.meeting_lock.benefit1",
          "feature.meeting_lock.benefit2",
          "feature.meeting_lock.benefit3",
        ],
        useCasesKey: ["feature.meeting_lock.usecase1", "feature.meeting_lock.usecase2"],
        category: "security",
      },
    ],
  },
  {
    categoryKey: "category.productivity",
    descriptionKey: "category.productivity.desc",
    features: [
      {
        id: "meeting_analytics",
        icon: "📈",
        titleKey: "feature.meeting_analytics.title",
        descriptionKey: "feature.meeting_analytics.desc",
        benefitsKey: [
          "feature.meeting_analytics.benefit1",
          "feature.meeting_analytics.benefit2",
          "feature.meeting_analytics.benefit3",
        ],
        useCasesKey: ["feature.meeting_analytics.usecase1", "feature.meeting_analytics.usecase2"],
        category: "productivity",
      },
      {
        id: "meeting_search",
        icon: "🔍",
        titleKey: "feature.meeting_search.title",
        descriptionKey: "feature.meeting_search.desc",
        benefitsKey: [
          "feature.meeting_search.benefit1",
          "feature.meeting_search.benefit2",
          "feature.meeting_search.benefit3",
        ],
        useCasesKey: ["feature.meeting_search.usecase1", "feature.meeting_search.usecase2"],
        category: "productivity",
      },
      {
        id: "avatar_mode",
        icon: "🤖",
        titleKey: "feature.avatar_mode.title",
        descriptionKey: "feature.avatar_mode.desc",
        benefitsKey: [
          "feature.avatar_mode.benefit1",
          "feature.avatar_mode.benefit2",
          "feature.avatar_mode.benefit3",
        ],
        useCasesKey: ["feature.avatar_mode.usecase1", "feature.avatar_mode.usecase2"],
        category: "productivity",
      },
    ],
  },
  {
    categoryKey: "category.media",
    descriptionKey: "category.media.desc",
    features: [
      {
        id: "recording",
        icon: "📹",
        titleKey: "feature.recording.title",
        descriptionKey: "feature.recording.desc",
        benefitsKey: [
          "feature.recording.benefit1",
          "feature.recording.benefit2",
          "feature.recording.benefit3",
        ],
        useCasesKey: ["feature.recording.usecase1", "feature.recording.usecase2"],
        category: "media",
      },
      {
        id: "noise_suppression",
        icon: "🔇",
        titleKey: "feature.noise_suppression.title",
        descriptionKey: "feature.noise_suppression.desc",
        benefitsKey: [
          "feature.noise_suppression.benefit1",
          "feature.noise_suppression.benefit2",
          "feature.noise_suppression.benefit3",
        ],
        useCasesKey: ["feature.noise_suppression.usecase1", "feature.noise_suppression.usecase2"],
        category: "media",
      },
      {
        id: "background_blur",
        icon: "🎭",
        titleKey: "feature.background_blur.title",
        descriptionKey: "feature.background_blur.desc",
        benefitsKey: [
          "feature.background_blur.benefit1",
          "feature.background_blur.benefit2",
          "feature.background_blur.benefit3",
        ],
        useCasesKey: ["feature.background_blur.usecase1", "feature.background_blur.usecase2"],
        category: "media",
      },
      {
        id: "hand_raise",
        icon: "✋",
        titleKey: "feature.hand_raise.title",
        descriptionKey: "feature.hand_raise.desc",
        benefitsKey: [
          "feature.hand_raise.benefit1",
          "feature.hand_raise.benefit2",
          "feature.hand_raise.benefit3",
        ],
        useCasesKey: ["feature.hand_raise.usecase1", "feature.hand_raise.usecase2"],
        category: "media",
      },
      {
        id: "low_bandwidth",
        icon: "📡",
        titleKey: "feature.low_bandwidth.title",
        descriptionKey: "feature.low_bandwidth.desc",
        benefitsKey: [
          "feature.low_bandwidth.benefit1",
          "feature.low_bandwidth.benefit2",
          "feature.low_bandwidth.benefit3",
        ],
        useCasesKey: ["feature.low_bandwidth.usecase1", "feature.low_bandwidth.usecase2"],
        category: "media",
      },
    ],
  },
];

export function getTranslation(language: string, key: string): string {
  const langTranslations = translations[language] || translations["en"];
  return langTranslations[key] || key;
}

export function getSalesContent(language: string): SalesContent {
  const langTranslations = translations[language] || translations["en"];
  return {
    language,
    platformName: getTranslation(language, "platform.name"),
    tagline: getTranslation(language, "platform.tagline"),
    categories: salesFeaturesDatabase.map((cat) => ({
      categoryKey: cat.categoryKey,
      descriptionKey: cat.descriptionKey,
      features: cat.features,
    })),
    translations: langTranslations,
  };
}
