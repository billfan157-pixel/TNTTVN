export interface ParishImage {
  src: string
  width: number
  height: number
}

export interface LandingMedia {
  heroVideo?: string
  lessonImage?: ParishImage
  familyImage?: ParishImage
}

// Only publish material approved by the parish. Missing media uses the real group photo
// or an explicitly illustrative product view, without requesting a nonexistent asset.
export const landingMedia: LandingMedia = {}
