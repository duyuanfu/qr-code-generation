package com.qrstudio.controller;

import com.qrstudio.common.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.*;

@RestController
@RequestMapping("/api/system")
public class SystemController {

    /**
     * 虚拟网卡名特征（小写包含匹配）。
     *
     * 这些网卡在本机上是有 IP 的，但手机永远连不上：Hyper-V 的 vEthernet 只在宿主机内部
     * 路由，Docker/TUN 更只在虚拟网络内可见。把它们列给用户，用户就会照着填一个
     * 扫码必然失败的地址，然后在手机上报错却找不到原因。
     */
    private static final String[] VIRTUAL_IFACE_MARKERS = {
        "vethernet", "hyper-v", "vmware", "vmnet", "virtualbox", "docker",
        "br-", "veth", "tun", "tap", "clash", "wsl", "tailscale", "zerotier", "loopback"
    };

    /**
     * 返回本机可用于局域网访问的 IPv4 地址列表。
     * 响应体统一使用 Result 包装，与其它接口保持一致（前端据此读取 data.addresses）。
     */
    @GetMapping("/network")
    public Result<?> getNetworkAddresses() {
        List<String> filtered = collect(false);
        // 兜底：如果这台机器的网卡全被判定为虚拟（例如整机跑在虚拟机里），
        // 过滤后为空会让用户完全没法填地址，此时宁可给全量列表让他自己挑。
        List<String> addresses = filtered.isEmpty() ? collect(true) : filtered;

        Map<String, Object> res = new HashMap<>();
        res.put("addresses", addresses);
        return Result.ok(res);
    }

    /**
     * @param keepAll true 时不过滤虚拟网卡（兜底用）
     */
    private List<String> collect(boolean keepAll) {
        Set<String> ipList = new LinkedHashSet<>();
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface iface = interfaces.nextElement();
                if (iface.isLoopback() || !iface.isUp()) continue;
                if (!keepAll && isVirtualInterface(iface)) continue;

                Enumeration<InetAddress> addresses = iface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress addr = addresses.nextElement();
                    if (!(addr instanceof Inet4Address) || addr.isLoopbackAddress()) continue;

                    String ip = addr.getHostAddress();
                    if (ip.startsWith("127.")) continue;
                    if (!keepAll && isReservedOrBenchmark(ip)) continue;
                    ipList.add(ip);
                }
            }
        } catch (Exception ignored) {
        }
        return new ArrayList<>(ipList);
    }

    private static boolean isVirtualInterface(NetworkInterface iface) {
        try {
            // TUN/TAP 一类的隧道设备在 JDK 里通常表现为 point-to-point
            if (iface.isVirtual() || iface.isPointToPoint()) return true;
        } catch (Exception ignored) {
            // 探测失败就按物理网卡处理，宁可多列一个地址，也不要漏掉真实地址
        }

        String name = iface.getName() == null ? "" : iface.getName().toLowerCase();
        String display = iface.getDisplayName() == null ? "" : iface.getDisplayName().toLowerCase();
        for (String marker : VIRTUAL_IFACE_MARKERS) {
            if (name.contains(marker) || display.contains(marker)) return true;
        }
        return false;
    }

    /**
     * 保留但不推介的地址段。
     *
     * 169.254/16 是网卡未连接时系统自动分配的链路本地地址；
     * 198.18/15 是 RFC 2544 基准测试段，被 Clash 等代理工具用作 fake-ip 默认池，
     * 真实服务器不会落在这个段里。
     */
    private static boolean isReservedOrBenchmark(String ip) {
        return ip.startsWith("169.254.")
            || ip.startsWith("198.18.")
            || ip.startsWith("198.19.");
    }
}
