package sa.madarij.app;

import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.UpdateAvailability;

@CapacitorPlugin(name = "NativeUpdate")
public class NativeUpdatePlugin extends Plugin {
    @PluginMethod
    public void check(PluginCall call) {
        String packageName = getContext().getPackageName();
        try {
            PackageManager manager = getContext().getPackageManager();
            String installer = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? manager.getInstallSourceInfo(packageName).getInstallingPackageName()
                : manager.getInstallerPackageName(packageName);
            if (!"com.android.vending".equals(installer)) {
                JSObject result = new JSObject();
                result.put("channel", "direct");
                result.put("available", false);
                call.resolve(result);
                return;
            }
        } catch (PackageManager.NameNotFoundException exception) {
            call.reject("Could not determine the installation source", exception);
            return;
        }
        AppUpdateManagerFactory.create(getContext()).getAppUpdateInfo()
            .addOnSuccessListener(info -> {
                JSObject result = new JSObject();
                result.put("channel", "google-play");
                int availability = info.updateAvailability();
                boolean available = availability == UpdateAvailability.UPDATE_AVAILABLE
                    || availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS;
                result.put("available", available);
                result.put("checked", availability != UpdateAvailability.UNKNOWN);
                if (available) {
                    result.put("minimumBuild", info.availableVersionCode());
                    result.put("url", "https://play.google.com/store/apps/details?id=" + packageName);
                }
                call.resolve(result);
            })
            .addOnFailureListener(exception -> call.reject("Could not check Google Play updates", exception));
    }
}
