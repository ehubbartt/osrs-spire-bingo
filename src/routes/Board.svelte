<script>
  import { onMount } from "svelte";
  import { supabase } from "../lib/supabase";
  import TileMap from "../lib/components/TileMap.svelte";
  import BossFight from "../lib/components/BossFight.svelte";
  // Import full floors
  import floor1Data from "../lib/floors/floor1.json";
  import floor2Data from "../lib/floors/floor2.json";
  // Uncomment these to use test floors (3 tiles each for faster testing):
  // import floor1Data from "../lib/floors/floor1_test.json";
  // import floor2Data from "../lib/floors/floor2_test.json";

  let { team, onLogout } = $props();

  let progress = $state([]);
  let powerups = $state([]);
  let loading = $state(true);
  let selectedTile = $state(null);
  let selectedProgress = $state(null);
  let inBossFight = $state(false);
  let currentFloor = $state(1);

  // Get current floor data
  let floorData = $derived(currentFloor === 1 ? floor1Data : currentFloor === 2 ? floor2Data : floor1Data);

  // Load team's current floor from database
  async function loadTeamFloor() {
    const { data, error } = await supabase
      .from("teams")
      .select("current_floor")
      .eq("id", team.id)
      .single();

    if (error) {
      console.error("Error loading team floor:", error);
      return;
    }

    if (data) {
      currentFloor = data.current_floor || 1;
      team.current_floor = currentFloor; // Update team object
      console.log("Loaded floor from database:", currentFloor);
    }
  }

  // Load team progress
  async function loadProgress() {
    const { data, error } = await supabase
      .from("team_progress")
      .select("*")
      .eq("team_id", team.id);

    if (error) {
      console.error("Error loading progress:", error);
      return;
    }

    progress = data || [];
    loading = false;
  }

  // Load powerup inventory
  async function loadPowerups() {
    const { data, error } = await supabase
      .from("powerup_inventory")
      .select("*")
      .eq("team_id", team.id)
      .is("used_on_tile", null); // Only show unused powerups

    if (error) {
      console.error("Error loading powerups:", error);
      return;
    }

    powerups = data || [];
  }

  // Subscribe to real-time updates
  function subscribeToUpdates() {
    const channel = supabase
      .channel("team_progress_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_progress",
          filter: `team_id=eq.${team.id}`,
        },
        (payload) => {
          console.log("Progress updated:", payload);
          loadProgress();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  // Handle tile click
  function handleTileClick(tile, tileProgress) {
    if (tileProgress?.status === "locked") {
      return; // Can't interact with locked tiles
    }

    // If clicking on boss tile and it's unlocked, start boss fight
    if (tile.type === "boss" && tileProgress?.status === "unlocked") {
      inBossFight = true;
      return;
    }

    selectedTile = tile;
    selectedProgress = tileProgress;
  }

  // Close modal
  function closeModal() {
    selectedTile = null;
    selectedProgress = null;
  }

  // Handle boss defeated - do ALL floor progression work here
  async function handleBossDefeated() {
    try {
      console.log("🎉 Boss defeated! Starting floor progression...");
      console.log("Current floor:", currentFloor);

      // Mark boss tile as completed
      const bossTile = floorData.tiles.find(t => t.type === "boss");
      const bossProgress = progress.find(p => p.tile_id === bossTile.id);

      if (bossProgress) {
        console.log("Marking boss tile as completed:", bossTile.id);
        await supabase
          .from("team_progress")
          .update({
            status: "completed",
            completed_at: new Date().toISOString()
          })
          .eq("id", bossProgress.id);
        console.log("✓ Boss tile marked as completed");
      }

      // Move to next floor
      const nextFloor = currentFloor + 1;
      console.log("Attempting to advance to floor:", nextFloor);

      if (nextFloor <= 2) { // Only floors 1-2 for now
        // Update floor in database
        await supabase
          .from("teams")
          .update({ current_floor: nextFloor })
          .eq("id", team.id);
        console.log("✓ Floor updated in database to:", nextFloor);

        // Update localStorage and state
        team.current_floor = nextFloor;
        localStorage.setItem("osrs_bingo_team", JSON.stringify(team));
        currentFloor = nextFloor; // Update state immediately
        console.log("✓ Updated state to floor:", nextFloor);

        // Initialize or unlock next floor tiles
        const newFloorData = currentFloor === 2 ? floor2Data : floor1Data;

        // Check if tiles already exist for this floor
        const { data: existingProgress } = await supabase
          .from("team_progress")
          .select("tile_id")
          .eq("team_id", team.id)
          .in("tile_id", newFloorData.tiles.map(t => t.id));

        if (!existingProgress || existingProgress.length === 0) {
          // Initialize new floor tiles
          console.log("Initializing new floor tiles...");
          const progressEntries = newFloorData.tiles.map(tile => ({
            team_id: team.id,
            tile_id: tile.id,
            status: tile.isStarter ? "unlocked" : "locked",
            proof_image_url: null,
            started_at: tile.isStarter ? new Date().toISOString() : null,
            completed_at: null,
            admin_verified: false,
            powerup_earned: tile.powerup,
            powerup_used: false
          }));

          await supabase.from("team_progress").insert(progressEntries);
          console.log("✓ Successfully initialized floor", currentFloor, "tiles");
        } else {
          // Tiles exist, unlock the starter tile
          console.log("Floor tiles already exist, unlocking starter tile...");
          const starterTile = newFloorData.tiles.find(t => t.isStarter);
          if (starterTile) {
            await supabase
              .from("team_progress")
              .update({
                status: "unlocked",
                started_at: new Date().toISOString()
              })
              .eq("team_id", team.id)
              .eq("tile_id", starterTile.id);
            console.log("✓ Starter tile unlocked:", starterTile.id);
          }
        }
      }

      // Reload progress to reflect all changes
      await loadProgress();
      console.log("✓ All floor progression complete - victory screen ready");
    } catch (err) {
      console.error("Error in handleBossDefeated:", err);
    }
  }

  // Exit boss fight - just close the modal, everything is already done
  function exitBossFight() {
    console.log("Exiting boss fight, moving to floor:", currentFloor);
    inBossFight = false;
  }

  // Complete tile (for testing)
  async function completeTile() {
    if (!selectedTile || !selectedProgress) return;

    try {
      // Mark current tile as completed
      const { error: updateError } = await supabase
        .from("team_progress")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", selectedProgress.id);

      if (updateError) {
        console.error("Error completing tile:", updateError);
        return;
      }

      // If tile has a powerup, add it to inventory
      if (selectedTile.powerup) {
        const { error: powerupError } = await supabase
          .from("powerup_inventory")
          .insert({
            team_id: team.id,
            powerup_type: selectedTile.powerup,
            acquired_from_tile: selectedTile.id,
            used_on_tile: null,
          });

        if (powerupError) {
          console.error("Error adding powerup to inventory:", powerupError);
        }
      }

      // Make connected tiles selectable (so player can choose which one to unlock)
      const connectedTileIds = selectedTile.connections;

      if (connectedTileIds.length > 0) {
        const { error: selectableError } = await supabase
          .from("team_progress")
          .update({
            status: "selectable",
          })
          .eq("team_id", team.id)
          .in("tile_id", connectedTileIds)
          .eq("status", "locked");

        if (selectableError) {
          console.error("Error making tiles selectable:", selectableError);
        }
      }

      // Reload progress and powerups
      await loadProgress();
      await loadPowerups();
      closeModal();
    } catch (err) {
      console.error("Error in completeTile:", err);
    }
  }

  // Select a tile to unlock it
  async function selectTile() {
    if (!selectedTile || !selectedProgress) return;

    try {
      // First, check if there's already an unlocked tile (only one at a time)
      const alreadyUnlocked = progress.find((p) => p.status === "unlocked");
      if (alreadyUnlocked) {
        alert(
          "You already have an active tile! Complete it before selecting a new one."
        );
        return;
      }

      // Unlock the selected tile
      const { error: unlockError } = await supabase
        .from("team_progress")
        .update({
          status: "unlocked",
          started_at: new Date().toISOString(),
        })
        .eq("id", selectedProgress.id);

      if (unlockError) {
        console.error("Error unlocking tile:", unlockError);
        return;
      }

      // Set all other selectable tiles back to locked (you chose this one)
      const { error: lockOthersError } = await supabase
        .from("team_progress")
        .update({
          status: "locked",
        })
        .eq("team_id", team.id)
        .eq("status", "selectable")
        .neq("id", selectedProgress.id);

      if (lockOthersError) {
        console.error("Error locking other tiles:", lockOthersError);
      }

      // Reload progress
      await loadProgress();
      closeModal();
    } catch (err) {
      console.error("Error in selectTile:", err);
    }
  }

  // Select and complete tile in one action (for testing)
  async function selectAndCompleteTile() {
    if (!selectedTile || !selectedProgress) return;

    try {
      // If selectable, first unlock it, then complete it
      if (selectedProgress.status === "selectable") {
        // Check for already unlocked tile
        const alreadyUnlocked = progress.find((p) => p.status === "unlocked");
        if (alreadyUnlocked) {
          alert("You already have an active tile! Complete it first.");
          return;
        }

        // Set all other selectable tiles back to locked
        await supabase
          .from("team_progress")
          .update({ status: "locked" })
          .eq("team_id", team.id)
          .eq("status", "selectable")
          .neq("id", selectedProgress.id);
      }

      // Mark as completed
      await supabase
        .from("team_progress")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", selectedProgress.id);

      // If tile has a powerup, add it
      if (selectedTile.powerup) {
        await supabase.from("powerup_inventory").insert({
          team_id: team.id,
          powerup_type: selectedTile.powerup,
          acquired_from_tile: selectedTile.id,
          used_on_tile: null,
        });
      }

      // Make connected tiles selectable
      const connectedTileIds = selectedTile.connections;
      if (connectedTileIds.length > 0) {
        await supabase
          .from("team_progress")
          .update({ status: "selectable" })
          .eq("team_id", team.id)
          .in("tile_id", connectedTileIds)
          .eq("status", "locked");
      }

      await loadProgress();
      await loadPowerups();
      closeModal();
    } catch (err) {
      console.error("Error in selectAndCompleteTile:", err);
    }
  }

  // Reset team progress (for testing)
  async function resetProgress() {
    if (!confirm("Reset all progress? This cannot be undone!")) {
      return;
    }

    try {
      console.log("Starting reset for team:", team.id);

      // Delete all progress
      const { error: deleteError } = await supabase
        .from("team_progress")
        .delete()
        .eq("team_id", team.id);

      if (deleteError) {
        console.error("Error deleting progress:", deleteError);
        alert("Error deleting progress: " + deleteError.message);
        return;
      }

      console.log("Deleted old progress");

      // Delete all powerups
      const { error: powerupDeleteError } = await supabase
        .from("powerup_inventory")
        .delete()
        .eq("team_id", team.id);

      if (powerupDeleteError) {
        console.error("Error deleting powerups:", powerupDeleteError);
        alert("Error deleting powerups: " + powerupDeleteError.message);
        return;
      }

      console.log("Deleted powerups");

      // Delete all boss encounters
      const { error: bossDeleteError } = await supabase
        .from("boss_encounters")
        .delete()
        .eq("team_id", team.id);

      if (bossDeleteError) {
        console.error("Error deleting boss encounters:", bossDeleteError);
        alert("Error deleting boss encounters: " + bossDeleteError.message);
        return;
      }

      console.log("Deleted boss encounters");

      // Reset floor back to 1
      const { error: floorResetError } = await supabase
        .from("teams")
        .update({ current_floor: 1 })
        .eq("id", team.id);

      if (floorResetError) {
        console.error("Error resetting floor:", floorResetError);
        alert("Error resetting floor: " + floorResetError.message);
        return;
      }

      console.log("Reset floor to 1");

      // Update state and localStorage
      currentFloor = 1;
      team.current_floor = 1;
      localStorage.setItem("osrs_bingo_team", JSON.stringify(team));

      // Reinitialize starter tiles for floor 1
      const progressEntries = floor1Data.tiles.map((tile) => ({
        team_id: team.id,
        tile_id: tile.id,
        status: tile.isStarter ? "unlocked" : "locked",
        proof_image_url: null,
        started_at: tile.isStarter ? new Date().toISOString() : null,
        completed_at: null,
        admin_verified: false,
        powerup_earned: tile.powerup,
        powerup_used: false,
      }));

      console.log("Progress entries to insert:", progressEntries);

      const { data: insertedData, error: insertError } = await supabase
        .from("team_progress")
        .insert(progressEntries)
        .select();

      if (insertError) {
        console.error("Error reinitializing progress:", insertError);
        alert("Error creating progress: " + insertError.message);
        return;
      }

      console.log("Inserted new progress:", insertedData);
      alert("Progress reset successfully!");
      await loadProgress();
      await loadPowerups();
    } catch (err) {
      console.error("Error in resetProgress:", err);
      alert("Unexpected error: " + err.message);
    }
  }

  onMount(async () => {
    await loadTeamFloor();
    await loadProgress();
    await loadPowerups();
    const unsubscribe = subscribeToUpdates();
    return unsubscribe;
  });
</script>

<!-- Boss Fight Full Screen -->
{#if inBossFight}
  <BossFight
    boss={floorData.boss}
    {team}
    onBossDefeated={handleBossDefeated}
    onExit={exitBossFight}
  />
{/if}

<div class="board-container">
  <div class="header">
    <div class="team-info">
      <h2>{team.team_name}</h2>
      <span class="floor-badge">Floor {currentFloor}</span>
    </div>
    <div class="header-buttons">
      <button onclick={resetProgress} class="reset-btn">Reset Progress</button>
      <button onclick={onLogout} class="logout-btn">Logout</button>
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading floor data...</div>
  {:else}
    <div class="map-container">
      <TileMap
        tiles={floorData.tiles}
        {progress}
        onTileClick={handleTileClick}
      />
    </div>

    <!-- Progress stats and Powerup inventory -->
    <div class="bottom-section">
      <div class="stats">
        <div class="stat">
          <span class="stat-label">Completed:</span>
          <span class="stat-value">
            {progress.filter((p) => p.status === "completed").length} / {floorData
              .tiles.length}
          </span>
        </div>
        <div class="stat">
          <span class="stat-label">Active:</span>
          <span class="stat-value">
            {progress.filter((p) => p.status === "unlocked").length}
          </span>
        </div>
      </div>

      <!-- Powerup Inventory -->
      <div class="powerup-inventory">
        <h3>Powerups</h3>
        {#if powerups.length === 0}
          <p class="no-powerups">
            No powerups yet. Complete elite tiles to earn them!
          </p>
        {:else}
          <div class="powerup-list">
            {#each powerups as powerup}
              <div class="powerup-item">
                <span class="powerup-icon">
                  {#if powerup.powerup_type === "reroll"}
                    🔄
                  {:else if powerup.powerup_type === "skip"}
                    ⏭️
                  {:else}
                    ⭐
                  {/if}
                </span>
                <span class="powerup-name">{powerup.powerup_type}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Tile Detail Modal (simplified for now) -->
  {#if selectedTile}
    <div class="modal-overlay" onclick={closeModal}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>
            {#if selectedProgress?.status === "locked"}
              {selectedTile.type.replace("_", " ").toUpperCase()} Task
            {:else if selectedProgress?.status === "selectable"}
              Choose Your Path
            {:else}
              {selectedTile.task}
            {/if}
          </h3>
          <button class="close-btn" onclick={closeModal}>×</button>
        </div>
        <div class="modal-body">
          <div class="tile-type">
            {selectedTile.type.replace("_", " ").toUpperCase()}
          </div>
          <div class="tile-status">
            Status: {selectedProgress?.status || "Unknown"}
          </div>

          {#if selectedProgress?.status === "locked"}
            <div class="locked-message">
              🔒 This tile is locked. Complete connected tiles to unlock it.
            </div>
          {:else if selectedProgress?.status === "selectable"}
            <!-- Selectable tiles show full details but need to be chosen -->
            <div class="task-description">
              <strong>Task:</strong>
              {selectedTile.task}
            </div>

            {#if selectedTile.powerup}
              <div class="powerup-info">
                Powerup: {selectedTile.powerup}
              </div>
            {/if}

            <div class="selectable-message">
              ✨ This tile is ready to unlock. Click "Select This Tile" to
              choose it and start working on it.
            </div>

            <div class="button-group">
              <button onclick={selectTile} class="select-btn">
                Select This Tile
              </button>
              <button onclick={selectAndCompleteTile} class="quick-complete-btn">
                Select & Complete (Testing)
              </button>
            </div>
          {:else}
            <!-- Unlocked or completed tiles show full details -->
            <div class="task-description">
              <strong>Task:</strong>
              {selectedTile.task}
            </div>

            {#if selectedTile.powerup}
              <div class="powerup-info">
                Powerup: {selectedTile.powerup}
              </div>
            {/if}

            {#if selectedProgress?.status === "unlocked"}
              <div class="button-group">
                <button onclick={completeTile} class="complete-btn">
                  Mark as Complete (Testing)
                </button>
                <button onclick={selectAndCompleteTile} class="quick-complete-btn">
                  Quick Complete (Testing)
                </button>
              </div>
            {:else if selectedProgress?.status === "completed"}
              <div class="completed-badge">✓ Completed</div>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .board-container {
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #333;
  }

  .team-info {
    display: flex;
    align-items: center;
    gap: 15px;
  }

  .team-info h2 {
    margin: 0;
    color: #e94560;
  }

  .floor-badge {
    background: #16213e;
    color: #42a5f5;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #42a5f5;
    font-size: 0.9em;
    font-weight: 600;
  }

  .header-buttons {
    display: flex;
    gap: 10px;
  }

  .logout-btn,
  .reset-btn {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    color: white;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }

  .logout-btn {
    background: #e94560;
  }

  .logout-btn:hover {
    background: #ff5573;
    transform: translateY(-2px);
  }

  .reset-btn {
    background: #ff9800;
  }

  .reset-btn:hover {
    background: #ffa726;
    transform: translateY(-2px);
  }

  .loading {
    text-align: center;
    padding: 40px;
    color: #aaa;
  }

  .map-container {
    background: #16213e;
    border-radius: 12px;
    padding: 30px;
    margin-bottom: 20px;
    border: 2px solid #333;
  }

  .bottom-section {
    display: flex;
    gap: 20px;
    justify-content: space-between;
    align-items: flex-start;
  }

  .stats {
    display: flex;
    gap: 20px;
  }

  .stat {
    background: #16213e;
    padding: 15px 25px;
    border-radius: 8px;
    border: 1px solid #333;
  }

  .stat-label {
    color: #aaa;
    margin-right: 10px;
  }

  .stat-value {
    color: #e94560;
    font-weight: 600;
    font-size: 1.1em;
  }

  .powerup-inventory {
    background: #16213e;
    border: 2px solid #ffd700;
    border-radius: 12px;
    padding: 20px;
    min-width: 250px;
  }

  .powerup-inventory h3 {
    margin: 0 0 15px 0;
    color: #ffd700;
    font-size: 1.2em;
  }

  .no-powerups {
    color: #aaa;
    font-size: 0.9em;
    margin: 0;
  }

  .powerup-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .powerup-item {
    background: rgba(255, 215, 0, 0.1);
    border: 2px solid #ffd700;
    border-radius: 8px;
    padding: 10px 15px;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
  }

  .powerup-item:hover {
    background: rgba(255, 215, 0, 0.2);
    transform: translateY(-2px);
  }

  .powerup-icon {
    font-size: 1.5em;
  }

  .powerup-name {
    color: #ffd700;
    font-weight: 600;
    text-transform: capitalize;
  }

  @media (max-width: 768px) {
    .bottom-section {
      flex-direction: column;
    }

    .powerup-inventory {
      width: 100%;
    }
  }

  /* Modal styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal {
    background: #16213e;
    border: 2px solid #e94560;
    border-radius: 12px;
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #333;
  }

  .modal-header h3 {
    margin: 0;
    color: #e94560;
  }

  .close-btn {
    background: none;
    border: none;
    color: #aaa;
    font-size: 2em;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    width: 30px;
    height: 30px;
  }

  .close-btn:hover {
    color: #e94560;
  }

  .modal-body {
    padding: 20px;
  }

  .tile-type {
    display: inline-block;
    background: rgba(233, 69, 96, 0.2);
    color: #e94560;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8em;
    font-weight: 600;
    margin-bottom: 15px;
  }

  .tile-status {
    color: #aaa;
    margin-bottom: 10px;
  }

  .powerup-info {
    color: #ffd700;
    margin: 10px 0;
    font-weight: 600;
  }

  .selectable-message {
    margin-top: 15px;
    padding: 12px;
    background: rgba(255, 215, 0, 0.1);
    border: 1px solid #ffd700;
    border-radius: 6px;
    color: #ffd700;
    text-align: center;
    font-size: 0.9em;
  }

  .button-group {
    display: flex;
    gap: 10px;
    margin-top: 20px;
  }

  .button-group button {
    flex: 1;
  }

  .select-btn {
    padding: 15px;
    background: #ffd700;
    border: none;
    border-radius: 6px;
    color: #1a1a2e;
    font-weight: 600;
    font-size: 1em;
    cursor: pointer;
    transition: all 0.2s;
  }

  .select-btn:hover {
    background: #ffc107;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(255, 215, 0, 0.4);
  }

  .quick-complete-btn {
    padding: 15px;
    background: #FF9800;
    border: none;
    border-radius: 6px;
    color: white;
    font-weight: 600;
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.2s;
  }

  .quick-complete-btn:hover {
    background: #FFA726;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(255, 152, 0, 0.4);
  }

  .complete-btn {
    padding: 15px;
    background: #4caf50;
    border: none;
    border-radius: 6px;
    color: white;
    font-weight: 600;
    font-size: 1em;
    cursor: pointer;
    transition: all 0.2s;
  }

  .complete-btn:hover {
    background: #66bb6a;
    transform: translateY(-2px);
  }

  .completed-badge {
    margin-top: 20px;
    padding: 15px;
    background: rgba(76, 175, 80, 0.2);
    border: 2px solid #4caf50;
    border-radius: 6px;
    color: #4caf50;
    text-align: center;
    font-weight: 600;
    font-size: 1.1em;
  }

  .locked-message {
    margin-top: 20px;
    padding: 15px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    color: #aaa;
    text-align: center;
  }

  .powerup-hint {
    margin-top: 10px;
    color: #ffd700;
    font-weight: 600;
  }

  .task-description {
    margin: 15px 0;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    color: #eee;
  }
</style>
