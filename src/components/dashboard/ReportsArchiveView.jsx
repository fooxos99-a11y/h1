import React from 'react';
import { Button } from '@/components/ui/button';
import ReportsOverview from './ReportsOverview';
import ReportsProgress from './ReportsProgress';

/** Present archive contents and the existing deletion action, including an empty selection. */
export default function ReportsArchiveView({ archive, archiveRows, archives, isOnline, isDeletingArchive, deleteArchive }) {
      if (archive) {
        return <div className="space-y-6">
                <div className="flex flex-col gap-3 rounded-lg border border-primary/15 bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-black text-muted-foreground">{archive.title} - من {archive.periodFrom} إلى {archive.periodTo}</div>
                  <Button type="button" variant="outline" disabled={!isOnline || isDeletingArchive} onClick={deleteArchive} className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
                    حذف الأرشيف
                  </Button>
                </div>
                <ReportsOverview data={archive.overviewReport} />
                <ReportsProgress rows={archiveRows} period={archive.progressReport?.period} />
              </div>;
      }
      return <div className="rounded-lg border border-dashed border-primary/20 p-8 text-center text-muted-foreground">
                {archives.length ? 'اختر أرشيفًا لعرضه.' : 'لا توجد أرشيفات حاليًا.'}
              </div>;
    }
