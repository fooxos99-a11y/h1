import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Package, Pencil, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SettingToggle from '@/components/ui/setting-toggle';
import { useToast } from '@/components/ui/use-toast';
import StoreSettingsActions from '@/components/store/StoreSettingsActions';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import DashboardMobileHeaderActions from '@/components/dashboard/DashboardMobileHeaderActions';
import PointsValue from '@/components/points/PointsValue';
import StoreProductCard from '@/components/store/StoreProductCard';
import { studentsApi } from '@/services/studentsApi';
import useRewardUnits from '@/hooks/useRewardUnits';

const emptyProduct = {
  name: '',
  imageData: '',
  pointsPrice: 1,
  stock: '',
  isActive: true,
};

const storeTabClassName = (active) => `h-11 rounded-xl ${active
  ? 'bg-[#d7a43b] text-white hover:bg-[#e3b34c] hover:text-white'
  : 'text-white hover:bg-white/10 hover:text-white'}`;

const StoreSection = () => {
  const rewardUnits = useRewardUnits();
  const { toast } = useToast();
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [decidingOrderId, setDecidingOrderId] = useState(null);
  const decidingOrder = useRef(false);
  const [configuration, setConfiguration] = useState({
    pointsSystemEnabled: false,
    storeEnabled: false,
    storePurchaseDeductsRanking: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [configurationSaving, setConfigurationSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const originalDisplayImage = useRef('');
  const [form, setForm] = useState(emptyProduct);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const config = await studentsApi.getStoreConfiguration();
      setConfiguration(config);
      if (!config.storeEnabled) {
        setProducts([]);
        setOrders([]);
        return;
      }
      const [productData, orderData] = await Promise.all([
        studentsApi.getStoreProducts(),
        studentsApi.getStoreOrders(),
      ]);
      setProducts(productData.products || []);
      setOrders(orderData || []);
    } catch (error) {
      toast({ title: 'تعذر تحميل المتجر', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const updateConfiguration = async (patch) => {
    setConfigurationSaving(true);
    try {
      const config = await studentsApi.updateStoreConfiguration(patch);
      setConfiguration(config);
      if (!config.storeEnabled) {
        setProducts([]);
        setOrders([]);
      } else if (!configuration.storeEnabled) {
        const [productData, orderData] = await Promise.all([
          studentsApi.getStoreProducts(),
          studentsApi.getStoreOrders(),
        ]);
        setProducts(productData.products || []);
        setOrders(orderData || []);
      }
    } catch (error) {
      toast({ title: 'تعذر حفظ إعداد المتجر', description: error.message, variant: 'destructive' });
    } finally {
      setConfigurationSaving(false);
    }
  };

  const openProduct = (product = null) => {
    originalDisplayImage.current = product?.imageData || '';
    setEditingId(product?.id || null);
    setForm(product ? {
      name: product.name || '',
      imageData: product.imageData || '',
      pointsPrice: Number(product.pointsPrice || 1),
      stock: product.stock ?? '',
      isActive: product.isActive !== false,
    } : emptyProduct);
    setDialogOpen(true);
  };

  const readImage = (file) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      toast({ title: 'صورة غير صالحة', description: 'اختر PNG أو JPG أو WebP بحجم لا يتجاوز 10 ميجابايت.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, imageData: (typeof reader.result === 'string' ? reader.result : '') }));
    reader.onerror = () => toast({ title: 'تعذر قراءة الصورة', variant: 'destructive' });
    reader.readAsDataURL(file);
  };

  const saveProduct = async () => {
    if (!form.name.trim() || !form.imageData || Number(form.pointsPrice) < 1) {
      toast({ title: rewardUnits.text('أكمل اسم المنتج وصورته وسعره بالكيلومترات.'), variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        ...form,
        // Omit an unchanged display copy so the server retains the full original.
        imageData: editingId && form.imageData === originalDisplayImage.current ? undefined : form.imageData,
        pointsPrice: Number(form.pointsPrice),
        stock: form.stock === '' ? null : Number(form.stock),
      };
      const saved = editingId
        ? await studentsApi.updateStoreProduct(editingId, payload)
        : await studentsApi.createStoreProduct(payload);
      setProducts(current => editingId
        ? current.map(product => product.id === editingId ? { ...product, ...saved } : product)
        : [saved, ...current]);
      setDialogOpen(false);
    } catch (error) {
      toast({ title: 'تعذر حفظ المنتج', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleProductVisibility = async (product) => {
    const isActive = !product.isActive;
    try {
      await studentsApi.setStoreProductActive(product.id, isActive);
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, isActive } : item));
    } catch (error) {
      toast({ title: `تعذر ${isActive ? 'إظهار' : 'إخفاء'} المنتج`, description: error.message, variant: 'destructive' });
    }
  };

  const deleteProduct = async () => {
    if (!deletingProduct) return;
    try {
      await studentsApi.removeStoreProduct(deletingProduct.id);
      setProducts((current) => current.filter((item) => item.id !== deletingProduct.id));
      setDeletingProduct(null);
    } catch (error) {
      toast({ title: 'تعذر حذف المنتج', description: error.message, variant: 'destructive' });
    }
  };

  const decideOrder = async (order, status) => {
    if (decidingOrder.current) return;
    decidingOrder.current = true;
    setDecidingOrderId(order.id);
    try {
      await studentsApi.decideStoreOrder(order.id, status);
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status } : item));
    } catch (error) {
      toast({ title: 'تعذر تحديث الطلب', description: error.message, variant: 'destructive' });
    } finally {
      decidingOrder.current = false;
      setDecidingOrderId(null);
    }
  };

  const pendingOrders = orders.filter((order) => (order.status || (order.fulfilled ? 'accepted' : 'pending')) === 'pending');

  if (isLoading) return <DashboardLoader className="min-h-[420px]" />;

  const configurationActions = (
    <DashboardMobileHeaderActions>
      <StoreSettingsActions configuration={configuration} saving={configurationSaving} onChange={updateConfiguration} deductionLabel={rewardUnits.text('خصم الكيلومترات من الترتيب عند الشراء من المتجر')} />
    </DashboardMobileHeaderActions>
  );

  if (!configuration.storeEnabled) {
    return <div className="[font-family:var(--font-ui)]">{configurationActions}</div>;
  }

  const _resolveStoreSection = () => {
    if (tab === 'products') {
      if (products.length === 0) {
        return <Card><CardContent className="p-10 text-center text-sm font-bold text-muted-foreground">لا توجد منتجات.</CardContent></Card>;
      }
      return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <StoreProductCard key={product.id} product={product} inactive={!product.isActive} showUnlimitedStock>
                  <div className="grid grid-cols-3 gap-2">
                    <Button type="button" variant="outline" className="h-11 rounded-xl border-[#d7a43b]/30 bg-background/75 px-2" onClick={() => openProduct(product)}><Pencil className="h-4 w-4" /> تعديل</Button>
                    <Button type="button" variant="outline" className="h-11 rounded-xl border-[#d7a43b]/30 bg-background/75 px-2" onClick={() => toggleProductVisibility(product)}>{product.isActive ? 'إخفاء' : 'إظهار'}</Button>
                    <Button type="button" variant="outline" className="h-11 rounded-xl border-destructive/30 bg-background/75 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeletingProduct(product)} aria-label={`حذف ${product.name}`}><Trash2 className="h-4 w-4" /> حذف</Button>
                  </div>
              </StoreProductCard>
            ))}
          </div>;
    }
    if (pendingOrders.length === 0) {
      return <Card><CardContent className="p-10 text-center text-sm font-bold text-muted-foreground">لا توجد طلبات طلاب.</CardContent></Card>;
    }
    return <Card className="border-primary/20 bg-card">
          <CardContent className="divide-y divide-primary/10 p-0">
            {pendingOrders.map((order) => (
              <div key={order.id} className="flex min-h-16 flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-foreground">{order.studentName} — {order.productName}</span>
                  <span className="mt-1 block text-xs font-bold text-muted-foreground">{order.committeeName || 'بدون حلقة'} · {order.createdAt}</span>
                </span>
                <PointsValue value={order.pointsPrice} className="shrink-0 text-sm" />
                <div className="flex gap-2">
                  <Button className="min-h-11" disabled={decidingOrderId !== null} onClick={() => decideOrder(order, 'accepted')}>قبول</Button>
                  <Button variant="outline" className="min-h-11 text-destructive" disabled={decidingOrderId !== null} onClick={() => decideOrder(order, 'rejected')}>رفض</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>;
  };
  return (
    <div className="space-y-5 [font-family:var(--font-ui)]">
      {configurationActions}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#d7a43b]/20 bg-gradient-to-l from-[#052e41] to-[#083d52] p-2 shadow-[0_14px_34px_rgba(5,46,65,0.16)] sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" className={storeTabClassName(tab === 'products')} variant="ghost" onClick={() => setTab('products')}>
            <Package className="h-4 w-4" /> المنتجات
          </Button>
          <Button type="button" className={storeTabClassName(tab === 'orders')} variant="ghost" onClick={() => setTab('orders')}>
            <ShoppingBag className="h-4 w-4" /> طلبات الطلاب
          </Button>
        </div>
        {tab === 'products' && (
          <Button type="button" className="h-11 rounded-xl" onClick={() => openProduct()}>
            <Plus className="h-4 w-4" /> إضافة منتج
          </Button>
        )}
      </div>

      {_resolveStoreSection()}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl border-primary/30 bg-card text-foreground" dir="rtl">
          <DialogHeader><DialogTitle>{editingId ? 'تعديل المنتج' : 'إضافة منتج'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="store-product-name">اسم المنتج</Label>
              <Input id="store-product-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="store-product-price">{rewardUnits.text('السعر بالكيلومترات')}</Label>
                <Input id="store-product-price" type="number" min="1" value={form.pointsPrice} onChange={(event) => setForm({ ...form, pointsPrice: Number(event.target.value || 1) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="store-product-stock">المخزون</Label>
                <Input id="store-product-stock" type="number" min="0" placeholder="غير محدود" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} />
              </div>
            </div>
            <label className="flex min-h-24 cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-primary/30 bg-background/60 p-4 text-sm font-black text-primary">
              {form.imageData ? <img src={form.imageData} alt="معاينة المنتج" className="aspect-square h-20 w-20 rounded-xl bg-background object-contain p-1" /> : <ImagePlus className="h-6 w-6" />}
              <span>{form.imageData ? 'تغيير الصورة' : 'اختيار صورة المنتج'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => readImage(event.target.files?.[0])} />
            </label>
            <SettingToggle label="إظهار المنتج للطلاب" checked={form.isActive} onCheckedChange={(checked) => setForm({ ...form, isActive: checked })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button type="button" className="h-11" disabled={isSaving} onClick={saveProduct}>{isSaving ? 'جاري الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingProduct)} onOpenChange={(open) => !open && setDeletingProduct(null)}>
        <DialogContent className="max-w-sm border-primary/30 bg-card text-foreground" dir="rtl">
          <DialogHeader><DialogTitle>حذف المنتج؟</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingProduct(null)}>إلغاء</Button>
            <Button type="button" variant="destructive" onClick={deleteProduct}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StoreSection;
