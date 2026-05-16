require 'json'
require 'fileutils'
require 'base64'
require 'set'
require 'zlib'

# Define RPG Maker XP classes so Marshal can load them
module RPG
  class Map
    attr_accessor :tileset_id, :width, :height, :autoplay_bgm, :bgm, :autoplay_bgs, :bgs
    attr_accessor :encounter_list, :encounter_step, :data, :events
    attr_accessor :scroll_type, :parallax_name, :parallax_loop_x, :parallax_loop_y, :parallax_sx, :parallax_sy
    def initialize(width, height)
      @tileset_id = 1
      @width = width
      @height = height
      @scroll_type = 0
      @parallax_name = ""
      @parallax_loop_x = false
      @parallax_loop_y = false
      @parallax_sx = 0
      @parallax_sy = 0
      @autoplay_bgm = false
      @bgm = RPG::AudioFile.new
      @autoplay_bgs = false
      @bgs = RPG::AudioFile.new
      @encounter_list = []
      @encounter_step = 30
      @data = Table.new(width, height, 3)
      @events = {}
    end
  end

  class MapInfo
    attr_accessor :name, :parent_id, :order, :expanded, :scroll_x, :scroll_y
    def initialize
      @name = ""
      @parent_id = 0
      @order = 0
      @expanded = false
      @scroll_x = 0
      @scroll_y = 0
    end
  end

  class AudioFile
    attr_accessor :name, :volume, :pitch
    def initialize(name = "", volume = 100, pitch = 100)
      @name = name
      @volume = volume
      @pitch = pitch
    end
  end

  class Event
    attr_accessor :id, :name, :x, :y, :pages
    def initialize(x, y)
      @id = 0
      @name = ""
      @x = x
      @y = y
      @pages = [RPG::Event::Page.new]
    end

    class Page
      attr_accessor :condition, :graphic, :move_type, :move_speed, :move_frequency
      attr_accessor :move_route, :walk_anime, :step_anime, :direction_fix, :through
      attr_accessor :always_on_top, :trigger, :list
      def initialize
        @condition = RPG::Event::Page::Condition.new
        @graphic = RPG::Event::Page::Graphic.new
        @move_type = 0
        @move_speed = 3
        @move_frequency = 3
        @move_route = RPG::MoveRoute.new
        @walk_anime = true
        @step_anime = false
        @direction_fix = false
        @through = false
        @always_on_top = false
        @trigger = 0
        @list = [RPG::EventCommand.new]
      end

      class Condition
        attr_accessor :switch1_valid, :switch2_valid, :variable_valid, :self_switch_valid
        attr_accessor :switch1_id, :switch2_id, :variable_id, :variable_value, :self_switch_ch
        def initialize
          @switch1_valid = false
          @switch2_valid = false
          @variable_valid = false
          @self_switch_valid = false
          @switch1_id = 1
          @switch2_id = 1
          @variable_id = 1
          @variable_value = 0
          @self_switch_ch = "A"
        end
      end

      class Graphic
        attr_accessor :tile_id, :character_name, :character_hue, :direction, :pattern, :opacity, :blend_type
        def initialize
          @tile_id = 0
          @character_name = ""
          @character_hue = 0
          @direction = 2
          @pattern = 0
          @opacity = 255
          @blend_type = 0
        end
      end
    end
  end

  class EventCommand
    attr_accessor :code, :indent, :parameters
    def initialize(code = 0, indent = 0, parameters = [])
      @code = code
      @indent = indent
      @parameters = parameters
    end
  end

  class MoveRoute
    attr_accessor :repeat, :skippable, :list
    def initialize
      @repeat = true
      @skippable = false
      @list = [RPG::MoveCommand.new]
    end
  end

  class MoveCommand
    attr_accessor :code, :parameters
    def initialize(code = 0, parameters = [])
      @code = code
      @parameters = parameters
    end
  end

  # Tileset class for reading tileset data
  class Tileset
    attr_accessor :id, :name, :tileset_name, :autotile_names, :panorama_name, :panorama_hue
    attr_accessor :fog_name, :fog_hue, :fog_opacity, :fog_blend_type, :fog_zoom, :fog_sx, :fog_sy
    attr_accessor :battleback_name, :passages, :priorities, :terrain_tags
    def initialize
      @id = 0
      @name = ""
      @tileset_name = ""
      @autotile_names = Array.new(7, "")
      @panorama_name = ""
      @panorama_hue = 0
      @fog_name = ""
      @fog_hue = 0
      @fog_opacity = 64
      @fog_blend_type = 0
      @fog_zoom = 200
      @fog_sx = 0
      @fog_sy = 0
      @battleback_name = ""
      @passages = Table.new(384)
      @priorities = Table.new(384)
      @terrain_tags = Table.new(384)
    end
  end

  # System class for reading system data
  class System
    attr_accessor :magic_number, :party_members, :elements, :switches, :variables
    attr_accessor :windowskin_name, :title_name, :gameover_name, :battle_transition
    attr_accessor :title_bgm, :battle_bgm, :battle_end_me, :gameover_me, :cursor_se
    attr_accessor :decision_se, :cancel_se, :buzzer_se, :equip_se, :shop_se, :save_se
    attr_accessor :load_se, :battle_start_se, :escape_se, :actor_collapse_se
    attr_accessor :enemy_collapse_se, :words, :test_battlers, :test_troop_id
    attr_accessor :start_map_id, :start_x, :start_y, :battleback_name, :battler_name
    attr_accessor :battler_hue, :edit_map_id

    # Pokémon Essentials stores vocabulary strings in RPG::System::Words. Vanilla RMXP
    # uses a plain structure; Marshal still encodes the constant name. Define an empty
    # shell so Marshal.load can restore ivars without loading the full Essentials runtime.
    class Words
    end

    # Essentials: entries in test_battlers are RPG::System::TestBattler instances.
    class TestBattler
    end
  end
end

# Table class used by RPG Maker XP for map data
# Binary format (20-byte header + data):
#   4 bytes: dim   (number of dimensions: 1, 2, or 3)
#   4 bytes: xsize
#   4 bytes: ysize (1 if dim < 2)
#   4 bytes: zsize (1 if dim < 3)
#   4 bytes: total_elements (xsize * ysize * zsize)
#   N*2 bytes: tile data (unsigned 16-bit LE values)
class Table
  attr_reader :xsize, :ysize, :zsize

  def initialize(x, y = 1, z = 1)
    @dim = z > 1 ? 3 : (y > 1 ? 2 : 1)
    @xsize = x
    @ysize = y
    @zsize = z
    @data = Array.new(x * y * z, 0)
  end

  def [](x, y = 0, z = 0)
    @data[x + y * @xsize + z * @xsize * @ysize]
  end

  def []=(x, y, z = 0, v)
    @data[x + y * @xsize + z * @xsize * @ysize] = v
  end

  def _dump(limit)
    [@dim, @xsize, @ysize, @zsize, @xsize * @ysize * @zsize].pack("VVVVV") + @data.pack("v*")
  end

  def self._load(obj)
    dim, x, y, z, size = obj[0, 20].unpack("VVVVV")
    t = Table.new(x, y, z)
    t.instance_variable_set(:@dim, dim)
    t.instance_variable_set(:@data, obj[20..-1].unpack("v*"))
    t
  end
end

# RMXP built-in Tone (red, green, blue, gray) -- used in screen tints, fog, etc.
class Tone
  attr_accessor :red, :green, :blue, :gray

  def initialize(red = 0, green = 0, blue = 0, gray = 0)
    @red = red.to_f
    @green = green.to_f
    @blue = blue.to_f
    @gray = gray.to_f
  end

  def _dump(limit)
    [@red, @green, @blue, @gray].pack("EEEE")
  end

  def self._load(obj)
    r, g, b, a = obj.unpack("EEEE")
    Tone.new(r, g, b, a)
  end
end

# RMXP built-in Color (red, green, blue, alpha) -- used in flash colors, etc.
class Color
  attr_accessor :red, :green, :blue, :alpha

  def initialize(red = 0, green = 0, blue = 0, alpha = 255)
    @red = red.to_f
    @green = green.to_f
    @blue = blue.to_f
    @alpha = alpha.to_f
  end

  def _dump(limit)
    [@red, @green, @blue, @alpha].pack("EEEE")
  end

  def self._load(obj)
    r, g, b, a = obj.unpack("EEEE")
    Color.new(r, g, b, a)
  end
end

def create_map(file_path, map_data_json = nil)
  # Read JSON from stdin if not provided as argument (for large data)
  json_string = map_data_json
  if json_string.nil? || json_string.empty?
    json_string = STDIN.read
  end
  
  data = JSON.parse(json_string)
  data_dir = File.dirname(file_path)
  template_path = find_template_map(data_dir)
  map = nil

  if template_path && File.exist?(template_path)
    File.open(template_path, 'rb') do |f|
      map = Marshal.load(f)
    end
  end

  map ||= RPG::Map.new(data['width'], data['height'])

  map.width = data['width']
  map.height = data['height']
  map.tileset_id = data['tilesetId']
  map.autoplay_bgm = false if map.autoplay_bgm.nil?
  map.autoplay_bgs = false if map.autoplay_bgs.nil?
  map.bgm = RPG::AudioFile.new if map.bgm.nil?
  map.bgs = RPG::AudioFile.new if map.bgs.nil?
  map.encounter_list = [] if map.encounter_list.nil?
  map.encounter_step = 30 if map.encounter_step.nil?
  map.scroll_type = 0 if map.scroll_type.nil?
  map.parallax_name = "" if map.parallax_name.nil?
  map.parallax_loop_x = false if map.parallax_loop_x.nil?
  map.parallax_loop_y = false if map.parallax_loop_y.nil?
  map.parallax_sx = 0 if map.parallax_sx.nil?
  map.parallax_sy = 0 if map.parallax_sy.nil?
  map.events = {} if map.events.nil?
  map.data = Table.new(map.width, map.height, 3)
  
  # Fill map data
  layers = data['layers'] || data['data'] || []
  (0...3).each do |z|
    (0...map.height).each do |y|
      (0...map.width).each do |x|
        map.data[x, y, z] = layers[z][y][x] || 0
      end
    end
  end
  
  # Add events (minimal placeholders)
  events = {}
  (data['events'] || []).each_with_index do |event_data, index|
    event = RPG::Event.new(event_data['x'], event_data['y'])
    event.id = index + 1
    event.name = event_data['name'] || "Event#{event.id}"
    events[event.id] = event
  end
  map.events = events
  
  File.open(file_path, 'wb') do |f|
    Marshal.dump(map, f)
  end
  puts "Map created successfully at #{file_path}"
end

def clone_map(source_path, dest_path)
  unless File.exist?(source_path)
    puts JSON.generate({ error: "Source map not found: #{source_path}" })
    return
  end

  FileUtils.cp(source_path, dest_path)
  puts "Map cloned from #{source_path} to #{dest_path}"
end

def patch_map_data(file_path, map_data_json = nil)
  unless File.exist?(file_path)
    puts JSON.generate({ error: "Map file not found: #{file_path}" })
    return
  end

  # Read JSON from stdin if not provided as argument (for large data)
  json_string = map_data_json
  if json_string.nil? || json_string.empty?
    json_string = STDIN.read
  end

  data = JSON.parse(json_string)
  map = File.open(file_path, 'rb') { |f| Marshal.load(f) }

  # Remove events and encounters to avoid serialization issues
  map.events = {}
  map.encounter_list = []

  layers = data['layers'] || data['data'] || []
  
  # Validate layer structure
  if layers.empty? || layers[0].nil? || layers[0].empty?
    puts JSON.generate({ error: "Invalid layers data: empty or nil" })
    return
  end
  
  layer_width = layers[0].first&.length || 0
  layer_height = layers[0].length || 0
  
  puts "Patching map: file=#{file_path}"
  puts "Map dimensions: #{map.width}x#{map.height}"
  puts "Layer dimensions: #{layer_width}x#{layer_height}"
  
  # Validate dimensions match
  if layer_width != map.width || layer_height != map.height
    error_msg = "Dimension mismatch! Map: #{map.width}x#{map.height}, Layers: #{layer_width}x#{layer_height}"
    puts JSON.generate({ error: error_msg })
    STDERR.puts error_msg
    return
  end
  
  puts "Sample tile before patch: map.data[0,0,0]=#{map.data[0, 0, 0]}"
  puts "Sample tile from layers: layers[0][0][0]=#{layers[0] && layers[0][0] ? layers[0][0][0] : 'nil'}"

  tiles_written = 0
  tiles_skipped = 0
  
  (0...3).each do |z|
    layer = layers[z]
    next if layer.nil?
    
    (0...map.height).each do |y|
      row = layer[y]
      next if row.nil?
      
      (0...map.width).each do |x|
        new_tile = row[x]
        next if new_tile.nil?
        
        # Validate tile value is a valid integer
        if !new_tile.is_a?(Integer) || new_tile < 0 || new_tile > 65535
          STDERR.puts "Invalid tile value at [#{x},#{y},#{z}]: #{new_tile.inspect}"
          tiles_skipped += 1
          next
        end
        
        # Only write if tile actually changed (preserve original values)
        original_tile = map.data[x, y, z]
        if new_tile != original_tile
          map.data[x, y, z] = new_tile
          tiles_written += 1
        else
          tiles_skipped += 1
        end
      end
    end
  end
  
  puts "Wrote #{tiles_written} changed tiles, skipped #{tiles_skipped} unchanged tiles"
  puts "Sample tile after patch: map.data[0,0,0]=#{map.data[0, 0, 0]}"

  File.open(file_path, 'wb') do |f|
    Marshal.dump(map, f)
  end
  puts "Map data patched for #{file_path}"
end

def patch_map_tiles(file_path, map_data_json = nil)
  unless File.exist?(file_path)
    puts JSON.generate({ error: "Map file not found: #{file_path}" })
    return
  end

  json_string = map_data_json
  if json_string.nil? || json_string.empty?
    json_string = STDIN.read
  end

  data = JSON.parse(json_string)
  map = File.open(file_path, 'rb') { |f| Marshal.load(f) }

  layers = data['layers'] || data['data'] || []

  if layers.empty? || layers[0].nil? || layers[0].empty?
    puts JSON.generate({ error: "Invalid layers data: empty or nil" })
    return
  end

  layer_width = layers[0].first&.length || 0
  layer_height = layers[0].length || 0

  puts "Patching tiles (preserving events): file=#{file_path}"
  puts "Map dimensions: #{map.width}x#{map.height}, events: #{(map.events || {}).size}, encounters: #{(map.encounter_list || []).size}"
  puts "Layer dimensions: #{layer_width}x#{layer_height}"

  if layer_width != map.width || layer_height != map.height
    error_msg = "Dimension mismatch! Map: #{map.width}x#{map.height}, Layers: #{layer_width}x#{layer_height}"
    puts JSON.generate({ error: error_msg })
    STDERR.puts error_msg
    return
  end

  tiles_written = 0
  tiles_skipped = 0

  (0...3).each do |z|
    layer = layers[z]
    next if layer.nil?

    (0...map.height).each do |y|
      row = layer[y]
      next if row.nil?

      (0...map.width).each do |x|
        new_tile = row[x]
        next if new_tile.nil?

        if !new_tile.is_a?(Integer) || new_tile < 0 || new_tile > 65535
          STDERR.puts "Invalid tile value at [#{x},#{y},#{z}]: #{new_tile.inspect}"
          tiles_skipped += 1
          next
        end

        original_tile = map.data[x, y, z]
        if new_tile != original_tile
          map.data[x, y, z] = new_tile
          tiles_written += 1
        else
          tiles_skipped += 1
        end
      end
    end
  end

  puts "Wrote #{tiles_written} changed tiles, skipped #{tiles_skipped} unchanged tiles"

  File.open(file_path, 'wb') do |f|
    Marshal.dump(map, f)
  end
  puts "Map tiles patched (events preserved) for #{file_path}"
end

def dump_map_table(file_path)
  unless File.exist?(file_path)
    puts JSON.generate({ error: "Map file not found: #{file_path}" })
    return
  end

  map = File.open(file_path, 'rb') { |f| Marshal.load(f) }
  if map.nil? || map.data.nil?
    puts JSON.generate({ error: "Map data not found in: #{file_path}" })
    return
  end

  raw = map.data._dump(0)
  puts Base64.strict_encode64(raw)
end

def find_template_map(data_dir)
  candidates = Dir.glob(File.join(data_dir, 'Map*.rxdata')).reject do |p|
    File.basename(p) == 'MapInfos.rxdata'
  end
  return nil if candidates.empty?
  candidates.sort_by { |p| File.basename(p) }[0]
end

def update_map_infos(file_path, map_id, name)
  map_infos = {}
  if File.exist?(file_path) && File.size?(file_path)
    File.open(file_path, 'rb') do |f|
      map_infos = Marshal.load(f) || {}
    end
  end

  # Normalize MapInfos to a Hash (RMXP expects Hash<Integer, MapInfo>)
  if map_infos.is_a?(Array)
    normalized = {}
    map_infos.each_with_index do |info, index|
      next if info.nil?
      normalized[index] = info
    end
    map_infos = normalized
  elsif !map_infos.is_a?(Hash)
    map_infos = {}
  end

  map_id = map_id.to_i
  max_order = map_infos.values.map { |info| info.order }.compact.max || 0

  if map_infos[map_id]
    info = map_infos[map_id]
  elsif map_infos.values.any?
    template_info = map_infos.values.find { |entry| !entry.nil? }
    info = template_info ? Marshal.load(Marshal.dump(template_info)) : RPG::MapInfo.new
  else
    info = RPG::MapInfo.new
  end

  info.name = name
  info.parent_id = 0
  info.order = max_order + 1
  info.expanded = true
  info.scroll_x = 0
  info.scroll_y = 0

  map_infos[map_id] = info

  File.open(file_path, 'wb') do |f|
    Marshal.dump(map_infos, f)
  end
  puts "MapInfos updated with map #{map_id}"
end

def normalize_map_infos_hash(raw)
  map_infos = raw.nil? ? {} : raw
  if map_infos.is_a?(Array)
    normalized = {}
    map_infos.each_with_index do |info, index|
      next if info.nil?
      normalized[index] = info
    end
    map_infos = normalized
  elsif !map_infos.is_a?(Hash)
    map_infos = {}
  end
  map_infos
end

# stdin: JSON array of { "id", "parentId", "order" } covering every map id in MapInfos exactly.
def write_map_infos_hierarchy(file_path)
  unless File.exist?(file_path) && File.size?(file_path)
    puts JSON.generate({ error: "MapInfos file not found or empty: #{file_path}" })
    return
  end

  raw_payload = STDIN.read.to_s
  payload = JSON.parse(raw_payload)
  unless payload.is_a?(Array)
    puts JSON.generate({ error: 'Expected JSON array of {id,parentId,order}' })
    return
  end

  map_infos = normalize_map_infos_hash(File.open(file_path, 'rb') { |f| Marshal.load(f) })

  id_set = map_infos.keys.map { |k| k.to_i }.to_set
  incoming = {}

  payload.each do |row|
    next unless row.is_a?(Hash)
    id = row['id'].to_i
    next if id <= 0
    pid = row['parentId'].nil? ? row['parent_id'] : row['parentId']
    pid = pid.to_i
    ord = row['order'].to_i
    incoming[id] = { parent_id: pid, order: ord }
  end

  if incoming.size != id_set.size || incoming.keys.to_set != id_set
    puts JSON.generate({
      error: 'Payload map id set must match MapInfos exactly',
      expectedIds: id_set.to_a.sort,
      receivedIds: incoming.keys.sort
    })
    return
  end

  incoming.each do |id, h|
    p = h[:parent_id]
    if id == p
      puts JSON.generate({ error: "Map #{id} cannot be its own parent" })
      return
    end
    if p != 0 && !id_set.include?(p)
      puts JSON.generate({ error: "Invalid parentId #{p} for map #{id}: parent not in MapInfos" })
      return
    end
    info = map_infos[id]
    unless info
      puts JSON.generate({ error: "Missing MapInfo object for id #{id}" })
      return
    end
    info.parent_id = p
    info.order = h[:order]
  end

  File.open(file_path, 'wb') do |f|
    Marshal.dump(map_infos, f)
  end

  puts JSON.generate({ success: true, count: incoming.size })
rescue JSON::ParserError => e
  puts JSON.generate({ error: "Invalid JSON on stdin: #{e.message}" })
end

# Atomically delete a set of maps from a project.
#
# Pipeline:
#   1. Validate args, locate MapInfos.rxdata and System.rxdata.
#   2. PHASE 1 (backup) — make `.bak` copies of MapInfos.rxdata, System.rxdata,
#      and every Map###.rxdata that will be removed. Backups stay on disk until
#      the success path runs Phase 3.
#   3. PHASE 2 (apply) — delete the ids from MapInfos, remove the Map###.rxdata
#      files, write the new start_map_id / edit_map_id into System. All three
#      Marshal-loaded objects are MUTATED in place so unrelated RPG::MapInfo /
#      RPG::System fields are preserved on disk (do not rebuild objects).
#   4. PHASE 3 (commit) — on success, delete the `.bak` files.
#   5. On any exception during Phase 1 or 2: best-effort restore from `.bak`.
#      A `.bak` is deleted iff its restore succeeded (then the original is
#      byte-identical and the backup is just noise). A `.bak` is RETAINED
#      iff its restore failed, so the user has a manual recovery path for
#      that specific file (the on-disk original may be in an intermediate
#      state). No user-facing "restore from backup" copy is implied — this
#      is internal safety only (see design plan § 7).
#
# CLI args  : ARGV[0] = project root.
# stdin JSON: { "ids": [Number, ...], "newStartMapId": Number, "newEditMapId": Number }
def delete_maps(project_root)
  raw_payload = STDIN.read.to_s
  payload = JSON.parse(raw_payload)
  unless payload.is_a?(Hash)
    puts JSON.generate({ error: 'Expected JSON object { ids, newStartMapId, newEditMapId }' })
    return
  end

  ids = Array(payload['ids']).map { |v| v.to_i }.select { |v| v > 0 }.uniq
  new_start = (payload['newStartMapId'] || 0).to_i
  new_edit = (payload['newEditMapId'] || 0).to_i

  if ids.empty?
    puts JSON.generate({ error: 'No valid ids in payload (expected positive integers).' })
    return
  end

  data_dir = File.join(project_root, 'Data')
  map_infos_path = File.join(data_dir, 'MapInfos.rxdata')
  system_path = File.join(data_dir, 'System.rxdata')

  unless File.exist?(map_infos_path)
    puts JSON.generate({ error: "MapInfos.rxdata not found at #{map_infos_path}" })
    return
  end
  unless File.exist?(system_path)
    puts JSON.generate({ error: "System.rxdata not found at #{system_path}" })
    return
  end

  map_paths_to_delete = ids.each_with_object([]) do |id, acc|
    p = File.join(data_dir, "Map#{format('%03d', id)}.rxdata")
    acc << p if File.exist?(p)
  end

  # `backups` is the rollback ledger: each [original_path, bak_path] is added the
  # moment the .bak copy succeeds, so the rescue block can iterate it to restore.
  backups = []

  begin
    # ---- Phase 1: take .bak copies in a fixed order ----
    [map_infos_path, system_path, *map_paths_to_delete].each do |p|
      bak = "#{p}.bak"
      FileUtils.cp(p, bak)
      backups << [p, bak]
    end

    # ---- Phase 2a: drop ids from MapInfos and write back ----
    map_infos = normalize_map_infos_hash(File.open(map_infos_path, 'rb') { |f| Marshal.load(f) })
    deleted_from_infos = 0
    ids.each do |id|
      deleted_from_infos += 1 if map_infos.delete(id)
    end
    File.open(map_infos_path, 'wb') { |f| Marshal.dump(map_infos, f) }

    # ---- Phase 2b: delete Map###.rxdata files ----
    map_files_deleted = 0
    map_paths_to_delete.each do |p|
      if File.exist?(p)
        File.delete(p)
        map_files_deleted += 1
      end
    end

    # ---- Phase 2c: patch start_map_id + edit_map_id, preserve other System fields ----
    system = File.open(system_path, 'rb') { |f| Marshal.load(f) }
    # Mutate in-place so we don't lose magic_number, party_members, switches, audio, etc.
    if system.respond_to?(:start_map_id=)
      system.start_map_id = new_start
    else
      system.instance_variable_set(:@start_map_id, new_start)
    end
    if system.respond_to?(:edit_map_id=)
      system.edit_map_id = new_edit
    else
      system.instance_variable_set(:@edit_map_id, new_edit)
    end
    File.open(system_path, 'wb') { |f| Marshal.dump(system, f) }

    # ---- Phase 3: success path — clean up .bak files ----
    backups.each { |_, bak| File.delete(bak) if File.exist?(bak) }

    puts JSON.generate({
      success: true,
      deletedFromMapInfos: deleted_from_infos,
      mapFilesDeleted: map_files_deleted,
      newStartMapId: new_start,
      newEditMapId: new_edit,
      requestedIds: ids
    })
  rescue => e
    # ---- Rescue path: best-effort restore, per-file .bak retention. ----
    # For each backup: try to restore; on success delete the .bak (the original is
    # now byte-identical, so the backup is just noise); on failure keep the .bak so
    # the user has a manual recovery path for that specific file.
    restore_errors = []
    retained = []
    backups.each do |orig, bak|
      next unless File.exist?(bak)
      begin
        FileUtils.cp(bak, orig)
        File.delete(bak)
      rescue => rerr
        restore_errors << "#{orig}: #{rerr.message}"
        retained << bak
      end
    end
    puts JSON.generate({
      error: "delete_maps failed: #{e.message}",
      restoreErrors: restore_errors,
      backupsRetained: retained
    })
  end
rescue JSON::ParserError => e
  puts JSON.generate({ error: "Invalid JSON on stdin: #{e.message}" })
end

# ============================================================
# READ FUNCTIONS - Return JSON to stdout
# ============================================================

def read_map(file_path)
  unless File.exist?(file_path)
    puts JSON.generate({ error: "File not found: #{file_path}" })
    return
  end

  map = File.open(file_path, 'rb') { |f| Marshal.load(f) }

  # Convert Table to nested arrays [layer][y][x]
  layers = []
  (0...3).each do |z|
    layer = []
    (0...map.height).each do |y|
      row = []
      (0...map.width).each do |x|
        row << map.data[x, y, z]
      end
      layer << row
    end
    layers << layer
  end

  # Convert events hash to array with full details
  events = []
  (map.events || {}).each do |id, evt|
    event_data = {
      id: id,
      name: evt.name,
      x: evt.x,
      y: evt.y,
      pages: []
    }
    
    (evt.pages || []).each_with_index do |page, page_idx|
      page_data = {
        index: page_idx,
        trigger: page.trigger,
        moveType: page.move_type,
        moveSpeed: page.move_speed,
        moveFrequency: page.move_frequency,
        walkAnime: page.walk_anime,
        stepAnime: page.step_anime,
        directionFix: page.direction_fix,
        through: page.through,
        alwaysOnTop: page.always_on_top,
        graphic: {
          tileId: page.graphic.tile_id,
          characterName: page.graphic.character_name,
          characterHue: page.graphic.character_hue,
          direction: page.graphic.direction,
          pattern: page.graphic.pattern,
          opacity: page.graphic.opacity,
          blendType: page.graphic.blend_type
        },
        commands: []
      }

      # Convert event commands
      (page.list || []).each do |cmd|
        page_data[:commands] << {
          code: cmd.code,
          indent: cmd.indent,
          parameters: cmd.parameters
        }
      end

      event_data[:pages] << page_data
    end
    
    events << event_data
  end

  result = {
    tilesetId: map.tileset_id,
    width: map.width,
    height: map.height,
    autoplayBgm: map.autoplay_bgm,
    bgm: map.bgm ? { name: map.bgm.name, volume: map.bgm.volume, pitch: map.bgm.pitch } : nil,
    autoplayBgs: map.autoplay_bgs,
    bgs: map.bgs ? { name: map.bgs.name, volume: map.bgs.volume, pitch: map.bgs.pitch } : nil,
    encounterStep: map.encounter_step,
    encounterList: map.encounter_list || [],
    layers: layers,
    events: events
  }

  puts JSON.generate(result)
end

def read_map_infos(file_path)
  unless File.exist?(file_path)
    puts JSON.generate({ error: "File not found: #{file_path}" })
    return
  end

  map_infos = File.open(file_path, 'rb') { |f| Marshal.load(f) } || {}

  result = {}
  map_infos.each do |id, info|
    result[id] = {
      id: id,
      name: info.name,
      parentId: info.parent_id,
      order: info.order,
      expanded: info.expanded,
      scrollX: info.scroll_x,
      scrollY: info.scroll_y
    }
  end

  puts JSON.generate(result)
end

def read_tilesets(file_path)
  unless File.exist?(file_path)
    puts JSON.generate({ error: "File not found: #{file_path}" })
    return
  end

  tilesets = File.open(file_path, 'rb') { |f| Marshal.load(f) } || []

  result = []
  tilesets.each_with_index do |tileset, index|
    next if tileset.nil?
    
    # Convert Table to array for passages/priorities/terrain_tags
    passages = table_to_array(tileset.passages) if tileset.passages
    priorities = table_to_array(tileset.priorities) if tileset.priorities
    terrain_tags = table_to_array(tileset.terrain_tags) if tileset.terrain_tags

    result << {
      id: tileset.id || index,
      name: tileset.name,
      tilesetName: tileset.tileset_name,
      autotileNames: tileset.autotile_names || [],
      panoramaName: tileset.panorama_name,
      panoramaHue: tileset.panorama_hue,
      fogName: tileset.fog_name,
      fogHue: tileset.fog_hue,
      fogOpacity: tileset.fog_opacity,
      fogBlendType: tileset.fog_blend_type,
      fogZoom: tileset.fog_zoom,
      fogSx: tileset.fog_sx,
      fogSy: tileset.fog_sy,
      battlebackName: tileset.battleback_name,
      passages: passages,
      priorities: priorities,
      terrainTags: terrain_tags
    }
  end

  puts JSON.generate(result)
end

# Scan Scripts.rxdata for references to a candidate set of map ids.
#
# Scripts.rxdata format (RPG Maker XP / Pokemon Essentials):
#   Marshal-dumped Array of [section_id, name, deflated_source_bytes]
#   where deflated_source_bytes is `Zlib.deflate(source_text)`.
#
# Strategy (mirrors `scanTextForMapIds` in src/shared/mapEventReferences.ts):
#   - For each section: inflate, walk line-by-line.
#   - Only lines containing any caller-provided idiom substring (case-insensitive) are scanned.
#   - On those lines only: regex `\b\d+\b` against candidate ids.
#   - Every emitted match has confidence 'high' (idiom context required).
#
# Encoding: inflated bytes get forced to UTF-8 with invalid sequences replaced,
# so Windows-style encodings or stray bytes don't crash the regex. Section-level
# decompression errors are reported per-section (not fatal) so a single corrupt
# script section doesn't blind the whole scan.
#
# CLI args  : ARGV[0] = Scripts.rxdata path.
# stdin JSON: { "candidateIds": [Number, ...], "idioms": [String, ...] }
# Output    : { success: true, matches: [...], sectionErrors: [...] }
#   - match  : { sectionIndex, sectionName, line, targetMapId, confidence, snippet }
#   - error  : { sectionIndex, sectionName, error }
def scan_scripts_for_map_ids(file_path)
  raw_payload = STDIN.read.to_s
  payload = JSON.parse(raw_payload)
  unless payload.is_a?(Hash)
    puts JSON.generate({ error: 'Expected JSON object { candidateIds, idioms }' })
    return
  end

  candidate_ids = Array(payload['candidateIds']).map(&:to_i).select { |i| i > 0 }.to_set
  idioms_lower = Array(payload['idioms']).map { |s| s.to_s.downcase }

  if candidate_ids.empty?
    puts JSON.generate({ success: true, matches: [], sectionErrors: [] })
    return
  end

  unless File.exist?(file_path)
    puts JSON.generate({ error: "Scripts.rxdata not found at #{file_path}" })
    return
  end

  scripts = File.open(file_path, 'rb') { |f| Marshal.load(f) }
  unless scripts.is_a?(Array)
    puts JSON.generate({ error: 'Scripts.rxdata: expected an Array of [id, name, deflated]' })
    return
  end

  matches = []
  section_errors = []

  scripts.each_with_index do |entry, idx|
    next unless entry.is_a?(Array) && entry.length >= 3
    section_name = (entry[1] || '').to_s
    compressed = entry[2]
    next unless compressed.is_a?(String) && !compressed.empty?

    text = nil
    begin
      text = Zlib::Inflate.inflate(compressed)
    rescue => e
      section_errors << {
        sectionIndex: idx,
        sectionName: section_name,
        error: "inflate failed: #{e.message}"
      }
      next
    end

    # Force UTF-8 with replacement so the regex + JSON output are safe on Windows
    # (RMXP Ruby 1.8 era encoded scripts as Windows-1252 / Shift-JIS in some locales).
    text = text.force_encoding(Encoding::UTF_8)
    unless text.valid_encoding?
      text = text.encode(Encoding::UTF_8, invalid: :replace, undef: :replace, replace: '?')
    end

    text.each_line.with_index do |line, line_idx|
      idiom_hit = idioms_lower.any? { |idiom| !idiom.empty? && line.downcase.include?(idiom) }
      next unless idiom_hit

      line.scan(/\b(\d+)\b/) do |captures|
        n = captures[0].to_i
        next unless candidate_ids.include?(n)
        snippet = line.strip
        snippet = snippet[0, 80] + '…' if snippet.length > 80
        matches << {
          sectionIndex: idx,
          sectionName: section_name,
          line: line_idx + 1,
          targetMapId: n,
          confidence: 'high',
          snippet: snippet
        }
      end
    end
  end

  puts JSON.generate({ success: true, matches: matches, sectionErrors: section_errors })
rescue JSON::ParserError => e
  puts JSON.generate({ error: "Invalid JSON on stdin: #{e.message}" })
end

def read_system(file_path)
  unless File.exist?(file_path)
    puts JSON.generate({ error: "File not found: #{file_path}" })
    return
  end

  system = File.open(file_path, 'rb') { |f| Marshal.load(f) }

  result = {
    startMapId: system.start_map_id,
    startX: system.start_x,
    startY: system.start_y,
    editMapId: system.edit_map_id,
    partyMembers: system.party_members || [],
    elements: system.elements || [],
    switches: system.switches || [],
    variables: system.variables || [],
    windowskinName: system.windowskin_name,
    titleName: system.title_name,
    gameoverName: system.gameover_name,
    battleTransition: system.battle_transition,
    battlebackName: system.battleback_name
  }

  puts JSON.generate(result)
end

# Helper to convert 1D Table to array
def table_to_array(table)
  return [] unless table
  result = []
  xsize = table.instance_variable_get(:@xsize) || 0
  data = table.instance_variable_get(:@data) || []
  (0...xsize).each do |i|
    result << (data[i] || 0)
  end
  result
end

if __FILE__ == $0
  command = ARGV[0]
  case command
  when 'create_map'
    create_map(ARGV[1], ARGV[2])
  when 'update_map_infos'
    update_map_infos(ARGV[1], ARGV[2], ARGV[3])
  when 'write_map_infos_hierarchy'
    write_map_infos_hierarchy(ARGV[1])
  when 'delete_maps'
    delete_maps(ARGV[1])
  when 'clone_map'
    clone_map(ARGV[1], ARGV[2])
  when 'patch_map_data'
    patch_map_data(ARGV[1], ARGV[2])
  when 'patch_map_tiles'
    patch_map_tiles(ARGV[1], ARGV[2])
  when 'dump_map_table'
    dump_map_table(ARGV[1])
  when 'read_map'
    read_map(ARGV[1])
  when 'read_map_infos'
    read_map_infos(ARGV[1])
  when 'read_tilesets'
    read_tilesets(ARGV[1])
  when 'read_system'
    read_system(ARGV[1])
  when 'scan_scripts_for_map_ids'
    scan_scripts_for_map_ids(ARGV[1])
  else
    puts JSON.generate({ error: "Unknown command: #{command}" })
  end
end
