# Pocket Circuit

A local kart racer for up to four players on Sunbreak Coast. Each phone joins through the same QR code and receives its player number in join order. The laptop shows one chase view per player and a shared course map with the trackside barriers marked.

## Try tilt steering

From this project folder, run the following with Node.js 20+ and `cloudflared` installed.

```powershell
npm.cmd start -- --tunnel
```

1. Open [the laptop display](http://127.0.0.1:8080). Wait for **HTTPS link ready**.
2. Scan the QR code with your phone’s camera. Open the link in Safari or Chrome.
3. Choose **Test mode** for a solo three-lap race or **Play mode** to include the other players. Both use the same race rules. Tap the arrows on your phone to move across the 16-driver grid, then tap **Confirm**. With no phones connected, you can pick a driver and use the keyboard.
4. On iPhone, turn on Portrait Orientation Lock and hold your phone with its top pointing left. The controls are already rotated 90° in a portrait browser. In the lobby, hold the phone up like a steering wheel, tap **Enable tilt**, and allow motion access if prompted. The button becomes **Recenter** after calibration. Start from the laptop when everyone is ready.

Hold the lower-right pedal to accelerate and tilt the phone left or right to steer. The steering curve has a 1.3° dead zone and reaches its maximum at 41° of tilt.

Hold the left pedal alone to brake and keep holding it after stopping to reverse. To drift, hold the accelerator and brake together and tilt into the corner. The kart points sideways as soon as the drift starts. Bring the phone back to center for a shallow slide, then tilt to tighten or countersteer. When sparks appear, release the brake while holding the accelerator for a boost. Drive through a red mushroom for a gentler boost with a lower top speed than a drift turbo. The laptop accepts WASD or arrow keys and **Shift** for drift. Use **S**, **Down**, or hold **Shift** from a stop to reverse.

Sunbreak Coast is about 778 meters per lap with a 16.56-meter road and a chicane after the opening straight. The barriers follow the course with about 7.5 meters of grass runoff on either side. Wall hits slow the kart without changing its heading. Checkpoints and the finish line also count when crossed in the grass, in the correct direction and order. A **Wrong Way** warning appears when you drive against the race direction. In multiplayer, karts can bump into each other, and trailing karts gradually gain up to 3% more on-road acceleration and top speed as the gap to the leader grows.

Red markers show mushrooms, yellow triangles show bananas, and green diamonds show shells. At the start, look for a glowing green ring and a floating shell in the middle of the road just past the start/finish line. Pick up a green shell and tap **Use** in the upper right of your phone or press **E** on the laptop to send it straight ahead. It bounces off walls and spins out the first rival it hits. Use **Fullscreen** on the laptop to expand the race while keeping the leaderboard and course map on the side.

The steering design uses proportional phone input and separates the kart's visual heading from the direction it travels. [Smartphone racing-controller evaluation](https://www.diva-portal.org/smash/get/diva2%3A831318/FULLTEXT01.pdf) · [Stanford drifting paper](https://ddl.stanford.edu/publications/conference-proceeding/controller-automated-drifting-along-complex-trajectories)

The temporary Cloudflare tunnel carries controller traffic in tunnel mode. The laptop display stays on localhost, and the QR code contains a random key for the current run. Stop the server with **Ctrl+C** when done. On macOS or Linux, use `npm` in place of `npm.cmd`.

## Same-Wi-Fi options

**Pedals only.** Run `npm.cmd start`, put both devices on the same Wi-Fi, and scan the QR code. The phone's pedals work over HTTP and you can steer with the laptop keyboard. Use HTTPS for phone tilt.

**Tilt without a tunnel.** Run `npm.cmd start -- --lan-https`. This uses OpenSSL 3. On Windows it also detects the OpenSSL bundled with Git for Windows. Copy the `phone-root.crt` file named in the terminal to your phone.

- On iPhone, open the certificate to install its profile. Then go to **Settings → General → About → Certificate Trust Settings** and enable full trust for **Pocket Circuit Local Test CA**. [Apple instructions](https://support.apple.com/en-us/102390)
- On Android, open **Settings → Security & privacy → More security settings → Encryption & credentials → Install a certificate** and choose **CA certificate**. Menu names can vary. [Android settings reference](https://support.google.com/pixelphone/answer/2844832)

Scan the QR code after trusting the certificate. Use the root certificate generated on your own laptop and remove the profile or CA from your phone when you’re done testing. If you already have HTTPS files your phone trusts, set `TLS_KEY` and `TLS_CERT` to their paths and run `npm.cmd start`.

If the Wi-Fi link uses the wrong network adapter, set `$env:LAN_HOST` to your laptop’s Wi-Fi IPv4 address before starting. The phone listener uses port 8081. Windows Firewall and networks with client isolation can prevent the phone from reaching the laptop.

## Chase camera

The `chase` settings in `public/drive.js` use a vertical FOV of 48° at rest and 57° at normal top speed, with a little extra width under turbo. Camera height is 3.9 simulation units and follow distance goes from 7.6 to 8.95 units before turbo. The camera follows the kart's direction of travel during a drift so the kart can visibly yaw across the roadway. These are project-specific values tuned for a 16:9 view. [Kart-racer camera parameter reference](https://mkwiiki.org/wiki/KartCameraParam.bin)
