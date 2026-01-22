require 'json'
require 'fileutils'

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
        @condition = RPG::Event::Condition.new
        @graphic = RPG::Event::Graphic.new
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
  end
end

# Table class used by RPG Maker XP for map data
class Table
  def initialize(x, y, z = 1)
    @xsize = x
    @ysize = y
    @zsize = z
    @data = Array.new(x * y * z, 0)
  end
  def [](x, y, z = 0)
    @data[x + y * @xsize + z * @xsize * @ysize]
  end
  def []=(x, y, z = 0, v)
    @data[x + y * @xsize + z * @xsize * @ysize] = v
  end
  def _dump(limit)
    [@xsize, @ysize, @zsize, @xsize * @ysize * @zsize].pack("VVVV") + @data.pack("v*")
  end
  def self._load(obj)
    x, y, z, size = obj[0, 16].unpack("VVVV")
    t = Table.new(x, y, z)
    t.instance_variable_set(:@data, obj[16..-1].unpack("v*"))
    t
  end
end

def create_map(file_path, map_data_json)
  data = JSON.parse(map_data_json)
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
  when 'clone_map'
    clone_map(ARGV[1], ARGV[2])
  when 'read_map'
    read_map(ARGV[1])
  when 'read_map_infos'
    read_map_infos(ARGV[1])
  when 'read_tilesets'
    read_tilesets(ARGV[1])
  when 'read_system'
    read_system(ARGV[1])
  else
    puts JSON.generate({ error: "Unknown command: #{command}" })
  end
end
