import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const EvaluationScalingHelp = ({ type }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-full border-primary/25 text-primary"
        aria-label="شرح احتساب درجة المراجعة والربط"
      >
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="end"
      dir="rtl"
      className="w-[min(21rem,calc(100vw-1.5rem))] space-y-2 text-right [font-family:var(--font-ui)]"
    >
      <p className="text-sm font-black text-foreground">طريقة احتساب الدرجة</p>
      <p className="text-sm font-semibold leading-6 text-muted-foreground">
        {type === 'review'
          ? 'يُخصم عن كل خطأ مقدار خصم الخطأ المحدد في الإعدادات، مهما كان عدد الأوجه، ولا تنزل الدرجة عن صفر. يبقى خصم التنبيهات متناسبًا مع عدد الأوجه.'
          : 'أصل الدرجة ثابت مهما كان مقدار التسميع، ويُحسب الخصم بالتناسب مع عدد الأوجه؛ فخطأ واحد في ١٠ أوجه يعادل خطأين في ٢٠ وجهًا.'}
      </p>
      <p className="text-sm font-semibold leading-6 text-muted-foreground">
        عند تغيير أصل الدرجة يتغير حد النجاح تلقائيًا مع الحفاظ على نسبته. أما قيم خصم الخطأ والتنبيه فتبقى كما ضبطتها.
      </p>
    </PopoverContent>
  </Popover>
);

export default EvaluationScalingHelp;
