import React from 'react';
import PublicInfoLayout from '@/components/legal/PublicInfoLayout';
import { useSiteConfig } from '@/site/SiteProvider';

const FALLBACK_WHATSAPP_URL = 'https://wa.me/966539599222';

const Section = ({ title, children }) => (
  <section className="space-y-2">
    <h2 className="text-lg font-black text-foreground">{title}</h2>
    <div className="text-muted-foreground">{children}</div>
  </section>
);

const PrivacyPolicy = () => {
  const site = useSiteConfig();
  const whatsappUrl = site.whatsappUrl || FALLBACK_WHATSAPP_URL;

  return (
  <PublicInfoLayout title="سياسة الخصوصية" showSiteName={false}>
    <p className="text-muted-foreground">آخر تحديث: 24 يوليو 2026</p>

    <Section title="البيانات التي نعالجها">
      <p>نعالج بيانات التسجيل والحساب مثل الاسم ورقم الدخول ورقم الهوية والعمر ووسيلة تواصل ولي الأمر، إضافة إلى بيانات الحضور والخطط والتسميع والاختبارات والتقارير. وقد تُستخدم الكاميرا والميكروفون والموقع عند تشغيل ميزة تتطلبها وبعد موافقة الجهاز.</p>
    </Section>

    <Section title="سبب الاستخدام">
      <p>تُستخدم البيانات لتشغيل خدمات المجمع القرآني، إدارة الحسابات والحضور والخطط والتقييمات، تمكين التواصل، حماية الحسابات، وتحسين موثوقية الخدمة.</p>
    </Section>

    <Section title="المشاركة والحفظ">
      <p>لا نبيع البيانات الشخصية. تقتصر المعالجة على إدارة المجمع ومزودي البنية التقنية اللازمين لتشغيل الخدمة، مع تطبيق ضوابط وصول مناسبة. تُحفظ البيانات للمدة اللازمة للتشغيل والالتزامات النظامية، ثم تُحذف أو تُجرد من الهوية.</p>
    </Section>

    <Section title="حذف الحساب">
      <p>يمكن للمستخدم تقديم طلب حذف الحساب من رابط «طلب حذف الحساب» في تذييل الصفحة الرئيسية، ثم تسجيل الدخول عند الطلب. تظهر حالة الطلب داخل حسابه، ويمكن إلغاؤه قبل بدء المعالجة. يعالج مدير المجمع الطلب والبيانات المرتبطة به خلال مدة لا تتجاوز 30 يوماً، مع استثناء ما يلزم الاحتفاظ به نظامياً.</p>
    </Section>

    <Section title="التواصل">
      <p>
        للإستفسارات تواصل مع{' '}
        <a
          className="inline-flex min-h-11 items-center px-1 font-black text-primary underline"
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
        >
          الرقم
        </a>
      </p>
    </Section>
  </PublicInfoLayout>
  );
};

export default PrivacyPolicy;
