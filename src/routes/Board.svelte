<script>
  import { onMount } from 'svelte';
  import { supabase } from '../lib/supabase';
  import TileMap from '../lib/components/TileMap.svelte';
  import floorData from '../lib/floors/floor1.json';

  let { team, onLogout } = $props();

  let progress = $state([]);
  let loading = $state(true);
  let selectedTile = $state(null);
  let selectedProgress = $state(null);

  // Load team progress
  async function loadProgress() {
    const { data, error } = await supabase
      .from('team_progress')
      .select('*')
      .eq('team_id', team.id);

    if (error) {
      console.error('Error loading progress:', error);
      return;
    }

    progress = data || [];
    loading = false;
  }

  // Subscribe to real-time updates
  function subscribeToUpdates() {
    const channel = supabase
      .channel('team_progress_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_progress',
          filter: `team_id=eq.${team.id}`
        },
        (payload) => {
          console.log('Progress updated:', payload);
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
    if (tileProgress?.status === 'locked') {
      return; // Can't interact with locked tiles
    }
    selectedTile = tile;
    selectedProgress = tileProgress;
  }

  // Close modal
  function closeModal() {
    selectedTile = null;
    selectedProgress = null;
  }

  // Complete tile (for testing)
  async function completeTile() {
    if (!selectedTile || !selectedProgress) return;

    try {
      // Mark current tile as completed
      const { error: updateError } = await supabase
        .from('team_progress')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', selectedProgress.id);

      if (updateError) {
        console.error('Error completing tile:', updateError);
        return;
      }

      // Unlock connected tiles
      const connectedTileIds = selectedTile.connections;

      if (connectedTileIds.length > 0) {
        const { error: unlockError } = await supabase
          .from('team_progress')
          .update({
            status: 'unlocked',
            started_at: new Date().toISOString()
          })
          .eq('team_id', team.id)
          .in('tile_id', connectedTileIds)
          .eq('status', 'locked');

        if (unlockError) {
          console.error('Error unlocking tiles:', unlockError);
        }
      }

      // Reload progress
      await loadProgress();
      closeModal();
    } catch (err) {
      console.error('Error in completeTile:', err);
    }
  }

  // Reset team progress (for testing)
  async function resetProgress() {
    if (!confirm('Reset all progress? This cannot be undone!')) {
      return;
    }

    try {
      console.log('Starting reset for team:', team.id);

      // Delete all progress
      const { error: deleteError } = await supabase
        .from('team_progress')
        .delete()
        .eq('team_id', team.id);

      if (deleteError) {
        console.error('Error deleting progress:', deleteError);
        alert('Error deleting progress: ' + deleteError.message);
        return;
      }

      console.log('Deleted old progress');

      // Reinitialize starter tiles
      const progressEntries = floorData.tiles.map(tile => ({
        team_id: team.id,
        tile_id: tile.id,
        status: tile.isStarter ? 'unlocked' : 'locked',
        proof_image_url: null,
        started_at: tile.isStarter ? new Date().toISOString() : null,
        completed_at: null,
        admin_verified: false,
        powerup_earned: tile.powerup,
        powerup_used: false
      }));

      console.log('Progress entries to insert:', progressEntries);

      const { data: insertedData, error: insertError } = await supabase
        .from('team_progress')
        .insert(progressEntries)
        .select();

      if (insertError) {
        console.error('Error reinitializing progress:', insertError);
        alert('Error creating progress: ' + insertError.message);
        return;
      }

      console.log('Inserted new progress:', insertedData);
      alert('Progress reset successfully!');
      await loadProgress();
    } catch (err) {
      console.error('Error in resetProgress:', err);
      alert('Unexpected error: ' + err.message);
    }
  }

  onMount(() => {
    loadProgress();
    const unsubscribe = subscribeToUpdates();
    return unsubscribe;
  });
</script>

<div class="board-container">
  <div class="header">
    <div class="team-info">
      <h2>{team.team_name}</h2>
      <span class="floor-badge">Floor {team.current_floor}</span>
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

    <!-- Progress stats -->
    <div class="stats">
      <div class="stat">
        <span class="stat-label">Completed:</span>
        <span class="stat-value">
          {progress.filter(p => p.status === 'completed').length} / {floorData.tiles.length}
        </span>
      </div>
      <div class="stat">
        <span class="stat-label">Unlocked:</span>
        <span class="stat-value">
          {progress.filter(p => p.status === 'unlocked').length}
        </span>
      </div>
    </div>
  {/if}

  <!-- Tile Detail Modal (simplified for now) -->
  {#if selectedTile}
    <div class="modal-overlay" onclick={closeModal}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>
            {#if selectedProgress?.status === 'locked'}
              {selectedTile.type.replace('_', ' ').toUpperCase()} Task
            {:else}
              {selectedTile.task}
            {/if}
          </h3>
          <button class="close-btn" onclick={closeModal}>×</button>
        </div>
        <div class="modal-body">
          <div class="tile-type">{selectedTile.type.replace('_', ' ').toUpperCase()}</div>
          <div class="tile-status">Status: {selectedProgress?.status || 'Unknown'}</div>

          {#if selectedProgress?.status === 'locked'}
            <div class="locked-message">
              🔒 This tile is locked. Complete connected tiles to unlock it.
              {#if selectedTile.powerup}
                <p class="powerup-hint">⭐ This tile awards a powerup when completed!</p>
              {/if}
            </div>
          {:else}
            <!-- Only show task details if unlocked or completed -->
            <div class="task-description">
              <strong>Task:</strong> {selectedTile.task}
            </div>

            {#if selectedTile.powerup}
              <div class="powerup-info">
                💎 Powerup: {selectedTile.powerup}
              </div>
            {/if}

            {#if selectedProgress?.status === 'unlocked'}
              <button onclick={completeTile} class="complete-btn">
                Mark as Complete (Testing)
              </button>
            {:else if selectedProgress?.status === 'completed'}
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
    color: #42A5F5;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #42A5F5;
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
    background: #FF9800;
  }

  .reset-btn:hover {
    background: #FFA726;
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

  .stats {
    display: flex;
    gap: 20px;
    justify-content: center;
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
    color: #FFD700;
    margin: 10px 0;
    font-weight: 600;
  }

  .complete-btn {
    margin-top: 20px;
    width: 100%;
    padding: 15px;
    background: #4CAF50;
    border: none;
    border-radius: 6px;
    color: white;
    font-weight: 600;
    font-size: 1em;
    cursor: pointer;
    transition: all 0.2s;
  }

  .complete-btn:hover {
    background: #66BB6A;
    transform: translateY(-2px);
  }

  .completed-badge {
    margin-top: 20px;
    padding: 15px;
    background: rgba(76, 175, 80, 0.2);
    border: 2px solid #4CAF50;
    border-radius: 6px;
    color: #4CAF50;
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
    color: #FFD700;
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
