<script>
  let { tiles, progress, onTileClick } = $props();

  // Tile type colors
  const tileColors = {
    skilling: '#4CAF50',
    elite_skilling: '#66BB6A',
    pvm: '#F44336',
    elite_pvm: '#EF5350',
    ca: '#2196F3',
    elite_ca: '#42A5F5',
    mystery: '#9C27B0',
    boss: '#FF9800'
  };

  // Get tile status
  function getTileStatus(tileId) {
    const tileProgress = progress.find(p => p.tile_id === tileId);
    return tileProgress?.status || 'locked';
  }

  // Get tile progress data
  function getTileProgress(tileId) {
    return progress.find(p => p.tile_id === tileId);
  }

  // Check if tile is accessible (for visual feedback)
  function isAccessible(tile) {
    const status = getTileStatus(tile.id);
    return status === 'unlocked' || status === 'completed';
  }
</script>

<svg class="tile-map" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
  <!-- Draw connections first (so they appear behind tiles) -->
  {#each tiles as tile}
    {#each tile.connections as connectedId}
      {@const connectedTile = tiles.find(t => t.id === connectedId)}
      {#if connectedTile}
        <line
          x1={tile.position.x}
          y1={tile.position.y}
          x2={connectedTile.position.x}
          y2={connectedTile.position.y}
          class="connection"
          class:active={isAccessible(tile)}
        />
      {/if}
    {/each}
  {/each}

  <!-- Draw tiles -->
  {#each tiles as tile}
    {@const status = getTileStatus(tile.id)}
    {@const tileProgress = getTileProgress(tile.id)}
    <g
      class="tile"
      class:locked={status === 'locked'}
      class:unlocked={status === 'unlocked'}
      class:completed={status === 'completed'}
      class:boss={tile.type === 'boss'}
      onclick={() => onTileClick(tile, tileProgress)}
      role="button"
      tabindex="0"
    >
      <!-- Tile circle -->
      <circle
        cx={tile.position.x}
        cy={tile.position.y}
        r={tile.type === 'boss' ? 20 : 15}
        fill={tileColors[tile.type]}
        class="tile-circle"
      />

      <!-- Elite tiles get a glow effect -->
      {#if tile.type.startsWith('elite')}
        <circle
          cx={tile.position.x}
          cy={tile.position.y}
          r={tile.type === 'boss' ? 24 : 18}
          fill="none"
          stroke={tileColors[tile.type]}
          stroke-width="2"
          class="tile-glow"
        />
      {/if}

      <!-- Status indicator -->
      {#if status === 'completed'}
        <text
          x={tile.position.x}
          y={tile.position.y + 5}
          text-anchor="middle"
          class="status-icon"
        >
          ✓
        </text>
      {:else if status === 'locked'}
        <text
          x={tile.position.x}
          y={tile.position.y + 5}
          text-anchor="middle"
          class="status-icon lock"
        >
          🔒
        </text>
      {/if}

      <!-- Powerup indicator -->
      {#if tile.powerup && status !== 'completed'}
        <circle
          cx={tile.position.x + 10}
          cy={tile.position.y - 10}
          r="5"
          fill="#FFD700"
          class="powerup-indicator"
        />
      {/if}
    </g>
  {/each}
</svg>

<style>
  .tile-map {
    width: 100%;
    max-width: 800px;
    height: auto;
    margin: 0 auto;
    display: block;
  }

  .connection {
    stroke: #333;
    stroke-width: 2;
    opacity: 0.3;
  }

  .connection.active {
    stroke: #555;
    opacity: 0.6;
  }

  .tile {
    cursor: pointer;
    transition: all 0.2s;
  }

  .tile.locked {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tile:not(.locked):hover .tile-circle {
    filter: brightness(1.2);
  }

  .tile:not(.locked):hover {
    transform: scale(1.1);
  }

  .tile.boss .tile-circle {
    stroke: #FFA726;
    stroke-width: 3;
  }

  .tile-circle {
    transition: all 0.2s;
  }

  .tile-glow {
    opacity: 0.3;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 0.3;
    }
    50% {
      opacity: 0.6;
    }
  }

  .status-icon {
    font-size: 16px;
    fill: white;
    pointer-events: none;
    user-select: none;
  }

  .status-icon.lock {
    font-size: 12px;
  }

  .powerup-indicator {
    animation: bounce 1s infinite;
  }

  @keyframes bounce {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-3px);
    }
  }

  .tile.completed .tile-circle {
    opacity: 0.7;
  }
</style>
