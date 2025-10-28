<script>
  import { onMount } from "svelte";
  import { supabase } from "../supabase";
  import giantMoleImage from "../../assets/boss-giant-mole.png";
  import zulrahImage from "../../assets/boss-zulrah.png";

  let { boss, team, onBossDefeated, onExit } = $props();

  // Select the correct boss image based on boss name
  const bossImage = boss.name === "Zulrah" ? zulrahImage : giantMoleImage;

  let bossHp = $state(boss.hp);
  let maxHp = $state(boss.hp);
  let totalDamageDealt = $state(0);
  let dropCounts = $state({});
  let encounterId = $state(null);

  // Calculate HP based on total damage
  $effect(() => {
    bossHp = Math.max(0, maxHp - totalDamageDealt);
  });

  // Load boss encounter state
  async function loadBossState() {
    const { data, error } = await supabase
      .from("boss_encounters")
      .select("*")
      .eq("team_id", team.id)
      .eq("boss_id", boss.tileId)
      .single();

    if (error && error.code !== "PGRST116") {
      // Not found is ok
      console.error("Error loading boss state:", error);
      return;
    }

    if (data) {
      // Load existing encounter
      encounterId = data.id;
      totalDamageDealt = maxHp - data.current_hp;
      dropCounts = data.drops_used.reduce((acc, item) => {
        acc[item.item] = item.count;
        return acc;
      }, {});
      console.log("Loaded boss state:", data);
    }
  }

  // Save boss state to database
  async function saveBossState() {
    const dropsArray = Object.entries(dropCounts).map(([item, count]) => ({
      item,
      count,
    }));

    const encounterData = {
      team_id: team.id,
      boss_id: boss.tileId,
      current_hp: bossHp,
      max_hp: maxHp,
      drops_used: dropsArray,
      is_defeated: bossHp <= 0,
      updated_at: new Date().toISOString(),
    };

    if (encounterId) {
      // Update existing
      const { error } = await supabase
        .from("boss_encounters")
        .update(encounterData)
        .eq("id", encounterId);

      if (error) console.error("Error updating boss:", error);
    } else {
      // Create new
      const { data, error } = await supabase
        .from("boss_encounters")
        .insert(encounterData)
        .select()
        .single();

      if (error) {
        console.error("Error creating boss encounter:", error);
      } else {
        encounterId = data.id;
      }
    }
  }

  // Use a drop to deal damage (can be used multiple times)
  async function useDrop(drop) {
    // Increment damage
    totalDamageDealt += drop.damage;

    // Track how many times this drop was used
    dropCounts[drop.item] = (dropCounts[drop.item] || 0) + 1;
    dropCounts = { ...dropCounts }; // Trigger reactivity

    // Save to database
    await saveBossState();

    // Check if boss is defeated
    if (bossHp <= 0) {
      // Mark boss tile as completed
      setTimeout(() => {
        onBossDefeated();
      }, 1000);
    }
  }

  // Reset boss HP (for testing)
  async function resetBoss() {
    totalDamageDealt = 0;
    dropCounts = {};
    bossHp = maxHp;

    // Delete from database
    if (encounterId) {
      await supabase.from("boss_encounters").delete().eq("id", encounterId);
      encounterId = null;
    }
  }

  onMount(() => {
    loadBossState();
  });
</script>

<div class="boss-fight-container">
  <button class="exit-btn" onclick={onExit}>← Back to Map</button>

  <div class="boss-arena">
    <h1 class="boss-name">{boss.name}</h1>

    <!-- HP Bar -->
    <div class="hp-container">
      <div class="hp-bar-bg">
        <div
          class="hp-bar-fill"
          style="width: {(bossHp / maxHp) * 100}%"
          class:critical={bossHp <= maxHp * 0.25}
        ></div>
      </div>
      <div class="hp-text">{bossHp} / {maxHp} HP</div>
    </div>

    <!-- Boss Image -->
    <div class="boss-image-container">
      <img src={bossImage} alt={boss.name} class="boss-image" />
    </div>

    <!-- Drop Buttons -->
    <div class="drops-section">
      <h2>Use Drops to Damage Boss</h2>
      <div class="drops-grid">
        {#each boss.drops as drop}
          {@const useCount = dropCounts[drop.item] || 0}
          <button
            class="drop-button"
            class:used={useCount > 0}
            onclick={() => useDrop(drop)}
            disabled={bossHp <= 0}
          >
            <div class="drop-icon">⚔️</div>
            <div class="drop-name">{drop.item}</div>
            <div class="drop-damage">{drop.damage} damage</div>
            {#if useCount > 0}
              <div class="use-count-badge">×{useCount}</div>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- Victory Message -->
    {#if bossHp <= 0}
      <div class="victory-overlay">
        <div class="victory-message">
          <h1>🎉 BOSS DEFEATED! 🎉</h1>
          <p>You have conquered {boss.name}!</p>
          <button onclick={onExit} class="victory-btn">
            Continue to Next Floor →
          </button>
        </div>
      </div>
    {/if}

    <!-- Testing Reset Button -->
    <button class="reset-boss-btn" onclick={resetBoss}>
      Reset Boss (Testing)
    </button>
  </div>
</div>

<style>
  .boss-fight-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: #0a0a0a;
    z-index: 2000;
    overflow-y: auto;
  }

  .exit-btn {
    position: absolute;
    top: 20px;
    left: 20px;
    background: rgba(26, 26, 46, 0.9);
    border: 2px solid #e94560;
    color: #eee;
    padding: 12px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
    z-index: 10;
  }

  .exit-btn:hover {
    background: #e94560;
    transform: translateX(-5px);
  }

  .boss-arena {
    max-width: 1200px;
    margin: 0 auto;
    padding: 60px 20px 40px;
    text-align: center;
  }

  .boss-name {
    font-size: 3em;
    color: #e94560;
    margin: 0 0 30px 0;
    text-transform: uppercase;
    letter-spacing: 2px;
    text-shadow: 0 0 20px rgba(233, 69, 96, 0.5);
  }

  /* HP Bar */
  .hp-container {
    max-width: 600px;
    margin: 0 auto 40px;
  }

  .hp-bar-bg {
    width: 100%;
    height: 40px;
    background: #1a1a2e;
    border: 3px solid #333;
    border-radius: 20px;
    overflow: hidden;
    position: relative;
  }

  .hp-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #4caf50, #66bb6a);
    transition:
      width 0.5s ease,
      background 0.3s;
  }

  .hp-bar-fill.critical {
    background: linear-gradient(90deg, #e94560, #ff5573);
    animation: pulse-hp 1s infinite;
  }

  @keyframes pulse-hp {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }

  .hp-text {
    margin-top: 10px;
    font-size: 1.5em;
    font-weight: 600;
    color: #eee;
  }

  /* Boss Image */
  .boss-image-container {
    margin: 40px auto;
    max-width: 600px;
  }

  .boss-image {
    width: 100%;
    height: auto;
    border-radius: 12px;
    border: 3px solid #e94560;
    box-shadow: 0 0 30px rgba(233, 69, 96, 0.3);
    image-rendering: pixelated;
  }

  /* Drops Section */
  .drops-section {
    margin-top: 60px;
  }

  .drops-section h2 {
    color: #ffd700;
    font-size: 1.8em;
    margin-bottom: 30px;
  }

  .drops-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    max-width: 800px;
    margin: 0 auto;
  }

  .drop-button {
    background: #16213e;
    border: 3px solid #42a5f5;
    border-radius: 12px;
    padding: 25px 20px;
    cursor: pointer;
    transition: all 0.3s;
    position: relative;
    overflow: hidden;
  }

  .drop-button:hover:not(:disabled) {
    transform: translateY(-5px);
    border-color: #ffd700;
    box-shadow: 0 8px 20px rgba(66, 165, 245, 0.4);
  }

  .drop-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .drop-button.used {
    border-color: #4caf50;
    background: rgba(76, 175, 80, 0.1);
  }

  .drop-icon {
    font-size: 3em;
    margin-bottom: 10px;
  }

  .drop-name {
    font-size: 1.2em;
    color: #eee;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .drop-damage {
    color: #e94560;
    font-size: 1.5em;
    font-weight: bold;
  }

  .use-count-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    background: #4caf50;
    color: white;
    min-width: 30px;
    height: 30px;
    padding: 0 8px;
    border-radius: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1em;
    font-weight: bold;
  }

  /* Victory Overlay */
  .victory-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fadeIn 0.5s;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .victory-message {
    text-align: center;
    animation: slideUp 0.5s;
  }

  @keyframes slideUp {
    from {
      transform: translateY(50px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .victory-message h1 {
    font-size: 4em;
    color: #ffd700;
    margin: 0 0 20px 0;
    text-shadow: 0 0 30px rgba(255, 215, 0, 0.5);
  }

  .victory-message p {
    font-size: 1.5em;
    color: #eee;
    margin-bottom: 30px;
  }

  .victory-btn {
    padding: 15px 40px;
    background: #4caf50;
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 1.3em;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
  }

  .victory-btn:hover {
    background: #66bb6a;
    transform: translateY(-3px);
    box-shadow: 0 6px 20px rgba(76, 175, 80, 0.6);
  }

  .reset-boss-btn {
    margin-top: 40px;
    background: #ff9800;
    border: none;
    color: white;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }

  .reset-boss-btn:hover {
    background: #ffa726;
    transform: translateY(-2px);
  }
</style>
