# Pocket Circuit

A local kart racer for up to four human players across Sunbreak Coast, Apex Stadium, Summit Circuit, and Neon Divide. Single Player pits one human against 11 CPU drivers. Multiplayer fills the grid to 12 and displays four camera views. Developer Mode is a solo practice race with a speedometer. Humans start at the back of the grid.

## Try tilt steering

From this project folder, run the following with Node.js 20+ and `cloudflared` installed.

```powershell
npm.cmd start -- --tunnel
```

1. Open the **Laptop display** URL printed in the terminal. The default is [http://127.0.0.1:8080](http://127.0.0.1:8080). If a default port is occupied, the game uses an available port.
2. Select **Single Player**, **Multiplayer**, or **Developer Mode**. The QR code appears in the lobby. Wait for **HTTPS link ready**, then scan it with your phone. Match your controller color and player number to its race quadrant on the laptop. Multiplayer needs a connected phone before track selection.
3. Pick a track on the host screen and select **Next**. On the driver screen, use the arrows on your phone to choose a driver, then tap **Confirm**. In Single Player and Developer Mode, you can use the keyboard when no phone is connected.
4. On iPhone, turn on Portrait Orientation Lock and hold your phone with its top pointing left. The controls are already rotated 90° in a portrait browser. In the lobby, hold the phone up like a steering wheel, tap **Enable tilt**, and allow motion access if prompted. The button becomes **Recenter** after calibration. Start from the laptop when everyone is ready.

Hold the right side to accelerate and tilt the phone left or right to steer. The steering curve has a 1.3° dead zone and reaches its maximum at 44° of tilt.

Hold the lower-left pedal alone to brake and keep holding it after stopping to reverse. To drift, hold the accelerator and brake together and tilt into the corner. The kart points sideways as soon as the drift starts. Bring the phone back to center for a shallow slide, then tilt to tighten or countersteer. Hold the drift to charge blue Mini Turbo, orange Super Turbo, or purple Ultra Turbo. Release Brakes while holding the accelerator to fire the charged boost. The base top speed is 97 km/h on straights and 86 km/h while drifting. Grass limits regular top speed to 70%, and a mushroom temporarily raises it to 125% on both surfaces. The laptop accepts WASD or arrow keys and **Shift** for drift. Use **S**, **Down**, or hold **Shift** from a stop to reverse. An active drift carries onto the grass. **Reset kart** appears when the kart is stranded beyond the course boundary or in the Summit jump gap and puts you back on the course without restarting the lap.

Apex Stadium is a floodlit circuit of about 942 meters per lap with a long grandstand straight, a sharper chicane, and a tight infield hairpin.

Summit Circuit runs for two laps of about 2,183 meters each. The route rolls through alpine foothills, crosses two creek bridges, and passes through a short rock tunnel. The cyan edges mark a vertical hover wall with a left-hand hairpin. Steer left across the wall to line up with the descent. The kart makes a small hop as its wheels fold into hover position. Both karts spin and boost if they touch. The second half climbs to a summit ramp 56 meters above the landing across the ravine. Tap **Brakes** just before or just after takeoff to do a 360. A clean landing on the catch deck gives a trick boost. On the laptop, tap **Shift** or the brake key for the trick. Tilt the phone down to dive and gain speed. Pull back up to trade that speed for lift and climb out of the dive.

Sunbreak Coast is about 778 meters per lap with an 18.22-meter road and a chicane after the opening straight. The barriers follow the course with about 6.7 meters of grass runoff on either side. Wall hits slow the kart without changing its heading. Checkpoints and the finish line also count when crossed in the grass, in the correct direction and order. A **Wrong Way** warning appears when you drive against the race direction. In multiplayer, karts can bump into each other, and trailing karts gradually gain up to 3% more on-road acceleration and top speed as the gap to the leader grows.

Neon Divide is a 5.9 km point-to-point race through a nighttime skyline. The road changes elevation by about 81 meters, with gentler crests for better forward visibility. Three full rolls and the two intertwined Helix lanes remain. Follow the neon rails through the three-way fork, downtown chicanes, and rooftop bends. Cyan ground pads boost the kart, pink ramps launch it over gaps, and lime spin pillars give a boost and deflect karts sideways on impact.

The race opens with a course flyover followed by a camera move behind each kart and one shared countdown. Start holding Accelerate near **2** for a boost at **GO**. Holding it from **3** causes a burnout. If a phone disconnects, a CPU drives that kart until the phone reconnects. The lobby music starts after the first click or key press. Music and sound effects play from the laptop. Use **Sound on** to mute them. After a kart finishes, the camera eases outward and the CPU drives it around the course while its place and time stay locked. Once all racers finish, a fanfare introduces the results. Select **Continue** to fade back to track selection.

Drive through a floating item box to fill one of your two slots. Stacked boxes fill both empty slots. The large icon in the top-left shows the active item, the smaller icon shows the reserve, and your place appears in the bottom-right. Your coin count is in the bottom-left. Press **Use** on the phone or **E** on the laptop to use the item. Hold brake or **Shift** while using a banana to drop it behind you. A held banana, red shell, or green shell absorbs one incoming red or green shell and is consumed. Triple packs orbit the kart and absorb one hit per remaining item. Shells destroy dropped bananas. The red mushroom boosts speed, the green shell bounces, the red shell homes toward the next racer ahead, and the blue shell chases the leader and bursts into an expanding blue sphere. Fireballs bounce, boomerangs fly about 34 meters out before returning, walking bombs move before exploding, and the boom box sends out an expanding wave that moves with your kart and clears projectiles. An icon and sound warn you when a moving item is on a collision course. Use **Fullscreen** to keep the leaderboard and map beside the race. **Settings** saves separate music and sound effects levels for this browser.

Golden Mushroom can be used repeatedly for 6.5 seconds after the first press. Bullet Bill steers for you for five seconds. Rainbow Star gives seven seconds of higher top speed, immunity to items, and full speed on grass. Ink Ghost splashes the center of opponents’ views for 1.6 to 6 seconds, based on their position at the time of the spray. A squid appears before the ink lands. Racers farther back clear the ink sooner. Lightning briefly shrinks and slows rivals and takes up to three of their coins. Chomper Plant bites nearby karts and clears items ahead for six seconds. You can collect item boxes while it is active. Contact with either power-up spins out other racers.

Item odds change with every place and lock when you collect the box. Coins are common near the front, while lightning and other powerful items favor the back of the field. Pick up track coins or use a coin item to build up to 10 coins. Track coins appear singly, in pairs, and in small groups. A coin item tosses a spinning coin before awarding two coins. A hit that spins you out scatters up to three of your coins, which other racers can collect. Each coin raises normal top speed by 0.4%. The [Mario Kart 8 VS distance weights](https://www.mariowiki.com/Mario_Kart_8_item_probability_distributions) informed how the pool shifts as you fall back. The [roulette timing reference](https://mariokart.tech/wiki/items/) gives 190 frames and allows skipping after one second. Developer Mode combines the four pools so every item can be tried.

The steering design uses proportional phone input and separates the kart's visual heading from the direction it travels. [Smartphone racing-controller evaluation](https://www.diva-portal.org/smash/get/diva2%3A831318/FULLTEXT01.pdf) · [Stanford drifting paper](https://ddl.stanford.edu/publications/conference-proceeding/controller-automated-drifting-along-complex-trajectories)

The temporary Cloudflare tunnel carries controller traffic in tunnel mode. The laptop display stays on localhost, and the QR code contains a random key for the current run. Stop the server with **Ctrl+C** when done. On macOS or Linux, use `npm` in place of `npm.cmd`.

## Same-Wi-Fi options

**Pedals only.** Run `npm.cmd start`, put both devices on the same Wi-Fi, and scan the QR code. The phone's pedals work over HTTP and you can steer with the laptop keyboard. Use HTTPS for phone tilt.

**Tilt without a tunnel.** Run `npm.cmd start -- --lan-https`. This uses OpenSSL 3. On Windows it also detects the OpenSSL bundled with Git for Windows. Copy the `phone-root.crt` file named in the terminal to your phone.

- On iPhone, open the certificate to install its profile. Then go to **Settings → General → About → Certificate Trust Settings** and enable full trust for **Pocket Circuit Local Test CA**. [Apple instructions](https://support.apple.com/en-us/102390)
- On Android, open **Settings → Security & privacy → More security settings → Encryption & credentials → Install a certificate** and choose **CA certificate**. Menu names can vary. [Android settings reference](https://support.google.com/pixelphone/answer/2844832)

Scan the QR code after trusting the certificate. Use the root certificate generated on your own laptop and remove the profile or CA from your phone when you’re done testing. If you already have HTTPS files your phone trusts, set `TLS_KEY` and `TLS_CERT` to their paths and run `npm.cmd start`.

If the Wi-Fi link uses the wrong network adapter, set `$env:LAN_HOST` to your laptop's Wi-Fi IPv4 address before starting. The phone listener defaults to port 8081 and the QR code follows any port change. Windows Firewall and networks with client isolation can prevent the phone from reaching the laptop.

## Chase camera

The `chase` settings in `public/drive.js` use a vertical FOV of 48° at rest and 57° at normal top speed, with a little extra width under turbo. Camera height is 3.9 simulation units and follow distance goes from 7.6 to 8.95 units before turbo. The camera follows the kart's direction of travel during a drift so the kart can visibly yaw across the roadway. These are project-specific values tuned for a 16:9 view. [Kart-racer camera parameter reference](https://mkwiiki.org/wiki/KartCameraParam.bin)
