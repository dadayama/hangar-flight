import { Member, Members } from './entities'
import { MemberRepository, MemberRepositoryHandleError } from './repositories'
import { Notifier, NotifierHandleError } from './services'

export class DuplicatedMemberError extends Error {}
export class NotFoundMemberError extends Error {}

export class App {
  private readonly urlToGather: string
  private readonly numberOfTarget: number
  private readonly currentMemberRepository: MemberRepository
  private readonly historyMemberRepository: MemberRepository
  private readonly notifier: Notifier

  constructor({
    urlToGather,
    numberOfTarget,
    currentMemberRepository,
    historyMemberRepository,
    notifier,
  }: {
    urlToGather: string
    numberOfTarget: number
    currentMemberRepository: MemberRepository
    historyMemberRepository: MemberRepository
    notifier: Notifier
  }) {
    this.urlToGather = urlToGather
    this.numberOfTarget = numberOfTarget
    this.currentMemberRepository = currentMemberRepository
    this.historyMemberRepository = historyMemberRepository
    this.notifier = notifier
  }

  /**
   * 招集対象メンバーをランダムに取得し、通知を送る
   */
  async gather(): Promise<void> {
    try {
      const targetMembers = await this.pickMembers(this.numberOfTarget)
      if (targetMembers.length === 0) return

      const message = `ｱﾂﾏﾚｰ\n${this.urlToGather}`
      await this.notifier.notify(message, targetMembers)
    } catch (e) {
      console.warn(e)

      if (e instanceof MemberRepositoryHandleError) {
        this.notifier.notify('ﾒﾝﾊﾞｰ ﾃﾞｰﾀ ﾉ ｼｭﾄｸ･ｺｳｼﾝ ﾆ ｼｯﾊﾟｲ ｼﾏｼﾀ !!')
      } else if (e instanceof NotifierHandleError) {
        this.notifier.notify('ﾂｳﾁ ｻｰﾋﾞｽ ﾄﾉ ｾﾂｿﾞｸ ﾆ ﾓﾝﾀﾞｲ ｶﾞ ｱﾘﾏｽ !!')
      } else {
        this.notifier.notify('ﾓﾝﾀﾞｲｶﾞ ﾊｯｾｲ ｼﾏｼﾀ !!')
      }
    }
  }

  /**
   * 招集対象メンバーに追加する
   * @param {string} memberId メンバーID
   * @param {string} memberName メンバー名
   */
  async join(memberId: string, memberName: string): Promise<void> {
    const member = new Member(memberId, memberName)

    try {
      const hasBeenJoined = await this.hasBeenJoined(memberId)
      if (hasBeenJoined) {
        throw new DuplicatedMemberError('Member have already joined.')
      }

      await this.currentMemberRepository.add(member)
      this.notifier.notify('ｻﾝｶ ｱﾘｶﾞﾄｳ !!', member)
    } catch (e) {
      console.warn(e)

      if (e instanceof DuplicatedMemberError) {
        this.notifier.notifySecretly('ｽﾃﾞﾆ ｻﾝｶｽﾞﾐ ﾃﾞｽ !!', member)
      } else if (e instanceof MemberRepositoryHandleError) {
        this.notifier.notify('ﾒﾝﾊﾞｰ ﾃﾞｰﾀ ﾉ ｼｭﾄｸ･ｺｳｼﾝ ﾆ ｼｯﾊﾟｲ ｼﾏｼﾀ !!')
      } else {
        this.notifier.notify('ﾓﾝﾀﾞｲｶﾞ ﾊｯｾｲ ｼﾏｼﾀ !!')
      }
    }
  }

  /**
   * 招集対象メンバーから削除する
   * @param {string} memberId メンバーID
   * @param {string} memberName メンバー名
   */
  async leave(memberId: string, memberName: string): Promise<void> {
    const member = new Member(memberId, memberName)

    try {
      const hasBeenJoined = await this.hasBeenJoined(memberId)
      if (!hasBeenJoined) {
        throw new NotFoundMemberError('Member have not joined')
      }

      await this.currentMemberRepository.remove(member)
      this.notifier.notify('ﾏﾀﾈ !!', member)
    } catch (e) {
      console.warn(e)

      if (e instanceof DuplicatedMemberError) {
        this.notifier.notifySecretly('ｻﾝｶ ｼﾃ ｲﾏｾﾝ !!', member)
      } else if (e instanceof MemberRepositoryHandleError) {
        this.notifier.notify('ﾒﾝﾊﾞｰ ﾃﾞｰﾀ ﾉ ｼｭﾄｸ･ｺｳｼﾝ ﾆ ｼｯﾊﾟｲ ｼﾏｼﾀ !!')
      } else {
        this.notifier.notify('ﾓﾝﾀﾞｲｶﾞ ﾊｯｾｲ ｼﾏｼﾀ !!')
      }
    }
  }

  /**
   * 招集対象メンバーの有無を確認する
   * @param {string} memberId メンバーID
   */
  private async hasBeenJoined(memberId: string): Promise<boolean> {
    return await this.currentMemberRepository.exists(memberId)
  }

  /**
   * 招集対象メンバーをランダムに取得する
   * 現在のメンバー一覧と招集履歴を突き合わせ、可能な限り履歴に存在しないメンバーを選ぶ
   * @param {number} numberOfTargetMember 取得人数
   */
  private async pickMembers(numberOfTargetMember: number): Promise<Members> {
    const currentMembers = await this.currentMemberRepository.getAll()
    const gatheredMembers = await this.historyMemberRepository.getAll()

    // 現在のメンバー一覧から、招集履歴に存在しないメンバーのみを抽出する
    let targetMembers = currentMembers.remove(gatheredMembers)
    const numberOfMember = targetMembers.length

    let shouldFlush = false

    if (numberOfMember > numberOfTargetMember) {
      // 招集履歴に存在しないメンバーの数が取得人数を上回る場合、抽出したメンバーからさらにランダムに取得人数分だけ抽出する
      targetMembers = targetMembers.pickRandomized(numberOfTargetMember)
    } else if (numberOfMember < numberOfTargetMember) {
      // 招集履歴に存在しないメンバーの数が取得人数を下回る場合、現在のメンバー一覧から不足分を抽出して補う
      const numberToAdd = numberOfTargetMember - numberOfMember
      targetMembers = targetMembers.add(
        currentMembers.remove(targetMembers).pickRandomized(numberToAdd)
      )
      // 記録が埋まるので全記録をリセットする
      shouldFlush = true
    }

    this.recordHistory(targetMembers, shouldFlush)

    return targetMembers
  }

  /**
   * メンバーを招集履歴に記録する
   * @param {Members} members 記録対象のメンバー一覧
   * @param {boolean} shouldFlush 記録する前にこれまでの記録を削除するか否か
   */
  private async recordHistory(members: Members, shouldFlush = false): Promise<void> {
    if (shouldFlush) {
      await this.historyMemberRepository.flush()
    }
    this.historyMemberRepository.add(members)
  }
}
