# Pocket Circuit phone tilt setup

If your phone says **Tilt requires HTTPS**, the phone controller opened without a secure connection. The laptop's game screen can still use ordinary HTTP. The two laptops can run the same code and behave differently if only one has a working Cloudflare tunnel. [Browser motion controls](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent)

## Set up the other Windows laptop

1. Open PowerShell and check that Cloudflare's tunnel program is available.

   ```powershell
   cloudflared --version
   ```

   If PowerShell can't find it, install the Windows version, reopen PowerShell, and run the check again. [Cloudflare downloads](https://developers.cloudflare.com/tunnel/downloads/)

2. In the Pocket Circuit folder, double-click **Start-Pocket-Circuit.cmd** and choose **T**. You can also run this from the project folder.

   ```powershell
   npm.cmd start -- --tunnel
   ```

3. Open the game on your laptop at [http://127.0.0.1:8080](http://127.0.0.1:8080). Wait for **HTTPS link ready**. The QR code starts with a local HTTP link and changes when the tunnel is ready.
4. Scan the **new** QR code. On the phone, confirm that the address starts with `https://` and that the hostname ends in `.trycloudflare.com`. Tap **Enable tilt** and allow motion access if prompted. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

## If tilt still won't enable

- If the phone opens an address like `http://192.168.x.x:8081`, close that tab and scan again after **HTTPS link ready** appears.
- If the game says **HTTPS link unavailable**, copy the last few lines from the launcher window. Those lines may show why the tunnel failed. Keep the launcher running while you play.
- If the phone opens the HTTPS page but steering still doesn't respond, tap **Enable tilt** and check whether the browser is asking for motion permission.
