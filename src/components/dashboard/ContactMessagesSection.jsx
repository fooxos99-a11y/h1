import React, { useEffect, useState } from 'react';
import { MessageSquare, User, UserCheck } from 'lucide-react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';

const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '';

const ContactMessagesSection = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await studentsApi.getContactMessages());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch((error) => {
      toast({ title: 'تعذر تحميل رسائل التواصل', description: error.message, variant: 'destructive' });
    });
  }, [toast]);

  const _resolveContactMessagesSection = () => {
    if (loading) {
      return <DashboardLoader />;
    }
    if (rows.length === 0) {
      return <div className="rounded-2xl border border-dashed border-primary/20 py-12 text-center text-sm font-bold text-muted-foreground">
            لا توجد رسائل تواصل حاليًا.
          </div>;
    }
    return <div className="space-y-3">
            {rows.map((message) => (
              <article key={message.id} className="rounded-2xl border border-border bg-background p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-foreground">{message.senderName}</h3>
                      <span className={`inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-black ${message.linkedAccount ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                        {message.linkedAccount ? <UserCheck className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                        {message.linkedAccount ? 'صاحب حساب' : 'زائر'}
                      </span>
                      {message.status === 'replied' && <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black text-emerald-700 dark:text-emerald-300">تم الرد</span>}
                    </div>
                    <time className="mt-1 block text-[11px] font-bold text-muted-foreground">{formatDateTime(message.createdAt)}</time>
                  </div>
                </div>
                <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-card px-4 py-3 text-sm font-bold leading-7 text-foreground">{message.subject}</p>
                {message.reply && (
                  <div className="mt-3 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3">
                    <p className="text-xs font-black text-primary">رد المجمع</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm font-bold leading-7 text-foreground">{message.reply}</p>
                  </div>
                )}
              </article>
            ))}
          </div>;
  };
  return (
    <Card className="border-primary/30 bg-card [font-family:var(--font-ui)]">
      <CardHeader className="border-b border-primary/20">
        <h2 className="flex items-center gap-2 text-xl font-black text-foreground">
          <MessageSquare className="h-5 w-5 text-primary" />
          رسائل التواصل
        </h2>
      </CardHeader>
      <CardContent className="pt-6">
        {_resolveContactMessagesSection()}
      </CardContent>

    </Card>
  );
};

export default ContactMessagesSection;
